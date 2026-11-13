import HttpStatus from "http-status-codes";
import AuthModel from "../../model/Auth/auth.js";
import Website, { websiteListSections, websiteObjectSections } from "../../model/website/website.js";
import { normalizeDomain } from "../../utilis/domain.js";
import Teacher from "../../model/teacher/teacherInfo.js";
import StudentDetailsModel from "../../model/students/studentInfo.js";
import { NoticeService } from "../notice/notice.js";
import { PostService } from "../post/post.js";
import { GalleryService } from "../gallery/gallery.js";

const statusError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const SECTIONS = [...websiteObjectSections, ...websiteListSections];
const ACTIVE_OWNER = { role: "admin", isDeleted: false, isBlocked: false };

export class WebsiteService {

  /** The owner's website (null until first saved) with its public address and domain. */
  static async getMine(owner: { _id: unknown; siteSlug?: string | null; customDomain?: string | null }) {
    const website = await Website.findOne({ adminId: owner._id }).lean();
    return { website, siteSlug: owner.siteSlug ?? null, customDomain: owner.customDomain ?? null };
  }

  static async saveMine(owner: { _id: unknown; workType?: string | null }, input: Record<string, any>) {
    if (owner.workType !== "school" && owner.workType !== "coaching") throw statusError("Admin work type is not configured", HttpStatus.FORBIDDEN);
    const update: Record<string, any> = { workType: owner.workType };
    for (const section of SECTIONS) update[section] = input[section];
    const website = await Website.findOneAndUpdate({ adminId: owner._id }, { $set: update }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
    // The institute name also shows on enquiries and the Super Admin users page.
    await AuthModel.updateOne({ _id: owner._id }, { $set: { instituteName: input.settings.name.trim() } });
    return website;
  }

  static async setPublished(ownerId: unknown, isPublished: boolean) {
    const website = await Website.findOneAndUpdate(
      { adminId: ownerId },
      { $set: { isPublished, ...(isPublished ? { publishedAt: new Date() } : {}) } },
      { new: true },
    ).lean();
    if (!website) throw statusError("Save your website before publishing it", HttpStatus.BAD_REQUEST);
    return website;
  }

  /** The website of the institute a teacher or student belongs to (logo, name and office contact in their portal). */
  static async getForMember(user: { _id: unknown; role?: string | null }) {
    // Parents belong to their children's institute.
    const profile = user.role === "teacher"
      ? await Teacher.findOne({ teacherId: user._id }).select("adminId").lean()
      : await StudentDetailsModel.findOne(user.role === "parent" ? { parentId: user._id } : { studentId: user._id }).select("adminId").lean();
    const owner = profile?.adminId && await AuthModel.findOne({ _id: profile.adminId, role: "admin", isDeleted: false }).select("fullName instituteName workType").lean();
    if (!owner) throw statusError("Institute not found", HttpStatus.NOT_FOUND);
    const website = await Website.findOne({ adminId: owner._id }).select(SECTIONS.join(" ")).lean();
    return { website, instituteName: website?.settings?.name || owner.instituteName || owner.fullName, workType: owner.workType };
  }

  /** Owner and website behind a public address; hidden websites and blocked / deleted owners are "not found". */
  static async findPublished(siteSlug: string) {
    const owner = await AuthModel.findOne({ ...ACTIVE_OWNER, siteSlug: String(siteSlug ?? "").trim().toLowerCase() })
      .select("fullName instituteName workType siteSlug").lean();
    const website = owner && await Website.findOne({ adminId: owner._id, isPublished: true }).lean();
    if (!owner || !website) throw statusError("Website not found", HttpStatus.NOT_FOUND);
    return { owner, website };
  }

  /** What visitors see: draft list items are left out. */
  static async getPublic(siteSlug: string) {
    const { owner, website } = await this.findPublished(siteSlug);
    const profile: Record<string, any> = {};
    for (const section of websiteObjectSections) profile[section] = website[section] ?? {};
    for (const section of websiteListSections) profile[section] = (website[section] ?? []).filter((item) => item?.status !== "Draft");
    // Live notices and posts the owner marked "Show on website" lead the news feed; chosen albums lead the gallery.
    profile.updates = [...await NoticeService.websiteUpdates(owner._id), ...await PostService.websiteUpdates(owner._id), ...(profile.updates ?? [])];
    profile.gallery = [...await GalleryService.websiteGallery(owner._id), ...(profile.gallery ?? [])];
    return { siteSlug: owner.siteSlug, instituteName: website.settings?.name || owner.instituteName || owner.fullName, workType: website.workType, profile };
  }

  /** Published websites of active owners, for the platform landing page. */
  static async directory() {
    const websites = await Website.find({ isPublished: true }).select("adminId workType settings.name settings.logo settings.primary contact.address settings.address").lean();
    const owners = await AuthModel.find({ ...ACTIVE_OWNER, _id: { $in: websites.map((site) => site.adminId) }, siteSlug: { $type: "string" } })
      .select("siteSlug").lean();
    const slugByOwner = new Map(owners.map((owner) => [String(owner._id), owner.siteSlug]));
    return websites
      .filter((site) => slugByOwner.has(String(site.adminId)))
      .map((site) => ({
        siteSlug: slugByOwner.get(String(site.adminId)),
        name: site.settings?.name ?? "",
        logo: site.settings?.logo ?? "",
        primary: site.settings?.primary ?? "",
        address: site.contact?.address || site.settings?.address || "",
        workType: site.workType,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The published website whose owner has this domain (www. and port ignored). */
  static async findByDomain(host: string) {
    const customDomain = normalizeDomain(host);
    const owner = customDomain && await AuthModel.findOne({ ...ACTIVE_OWNER, customDomain }).select("siteSlug").lean();
    if (!owner?.siteSlug || !await Website.exists({ adminId: owner._id, isPublished: true })) throw statusError("Website not found", HttpStatus.NOT_FOUND);
    return { siteSlug: owner.siteSlug };
  }
}
