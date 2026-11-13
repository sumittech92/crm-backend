import HttpStatus from "http-status-codes";
import mongoose from "mongoose";
import Notice from "../../model/notice/notice.js";
import Course from "../../model/teacher/courseModel.js";
import Batch from "../../model/teacher/batchModel.js";
import { generateSixDigitId } from "../../utilis/generateId.js";
import { parseDay, todayKey } from "../../utilis/ownerScope.js";
import { StaffActor, actorScope, isOwnerLike, teacherSectionIds } from "../../utilis/staffAccess.js";

const statusError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const dayKey = (date: Date | string) => new Date(date).toISOString().slice(0, 10);
const codeOrId = (value: string, codeField: string) => {
  const text = String(value ?? "").trim();
  if (/^\d{6}$/.test(text)) return { [codeField]: text };
  if (mongoose.Types.ObjectId.isValid(text)) return { _id: text };
  return null;
};

/** draft → scheduled (before the publish date) → live → expired (after the expiry date). */
export type NoticeState = "draft" | "scheduled" | "live" | "expired";
export const noticeState = (notice: Record<string, any>): NoticeState => {
  if (notice.status === "draft") return "draft";
  const today = todayKey();
  if (dayKey(notice.publishDate) > today) return "scheduled";
  if (notice.expiryDate && dayKey(notice.expiryDate) < today) return "expired";
  return "live";
};

const TYPE_LABELS: Record<string, string> = { general: "Notice", holiday: "Holiday", exam: "Exam", feeReminder: "Fee reminder", newBatch: "New batch", ptm: "PTM", important: "Important" };

export class NoticeService {

  /** Owners manage every notice; a teacher manages student notices for batches / sections they teach. */
  private static canManage(notice: Record<string, any>, actor: StaffActor, myBatches: string[]) {
    if (isOwnerLike(actor)) return true;
    return actor.role === "teacher" && notice.audience === "students" && notice.batchIds?.length > 0 && notice.batchIds.every(id => myBatches.includes(String(id)));
  }

  /** Teachers see notices for everyone or teachers, and student notices of their batches or courses. */
  private static canView(notice: Record<string, any>, actor: StaffActor, myBatches: string[], myCourses: string[]) {
    if (this.canManage(notice, actor, myBatches)) return true;
    if (actor.role !== "teacher" || notice.status === "draft") return false;
    if (notice.audience !== "students") return true;
    if (notice.batchIds?.some(id => myBatches.includes(String(id)))) return true;
    return !notice.batchIds?.length && (!notice.courseId || myCourses.includes(String(notice.courseId)));
  }

  private static async teacherCourses(myBatches: string[]) {
    if (!myBatches.length) return [];
    return (await Batch.find({ _id: { $in: myBatches } }).select("courseId").lean()).map(batch => String(batch.courseId));
  }

  private static async prepare(input: Record<string, any>, actor: StaffActor, current?: Record<string, any>) {
    const workType = current?.workType ?? actor.workType;
    const adminId = current?.adminId ?? actor.adminId;
    const data: Record<string, any> = {};
    for (const field of ["title", "description", "type", "audience", "pinned", "showOnWebsite", "status"]) if (input[field] !== undefined) data[field] = input[field];
    if (data.type === "ptm" && workType !== "school") data.type = "general";
    if (data.type === "newBatch" && workType === "school") data.type = "general";
    if (input.publishDate !== undefined) data.publishDate = input.publishDate ? parseDay(input.publishDate, "publish date") : parseDay(todayKey());
    if (input.expiryDate !== undefined) data.expiryDate = input.expiryDate ? parseDay(input.expiryDate, "expiry date") : null;

    if (input.courseCode !== undefined) {
      const match = input.courseCode ? codeOrId(input.courseCode, "courseCode") : null;
      const course = match ? await Course.findOne({ ...match, adminId, workType }).select("_id").lean() : null;
      if (input.courseCode && !course) throw statusError(workType === "school" ? "Class not found" : "Course not found", HttpStatus.BAD_REQUEST);
      data.courseId = course?._id ?? null;
    }
    if (input.batchCodes !== undefined) {
      const matches = input.batchCodes.map(code => codeOrId(code, "batchCode"));
      if (matches.some(match => !match)) throw statusError("Invalid batch ID", HttpStatus.BAD_REQUEST);
      const batches = matches.length ? await Batch.find({ adminId, $or: matches }).select("_id courseId").lean() : [];
      if (batches.length !== new Set(input.batchCodes).size) throw statusError(workType === "school" ? "Section not found" : "Batch not found", HttpStatus.BAD_REQUEST);
      data.batchIds = batches.map(batch => batch._id);
      // Batches imply their course when none was chosen.
      if (batches.length && !(data.courseId ?? current?.courseId)) data.courseId = batches[0].courseId;
      data.batchCourses = batches.map(batch => String(batch.courseId));
    }

    const next = { ...current, ...data };
    if (data.batchCourses?.some(id => id !== String(next.courseId))) throw statusError(workType === "school" ? "Sections must belong to the chosen class" : "Batches must belong to the chosen course", HttpStatus.BAD_REQUEST);
    delete data.batchCourses;
    // Course and batches narrow student notices only.
    if (next.audience !== "students") Object.assign(data, { courseId: null, batchIds: [] });
    if (next.expiryDate && next.publishDate && dayKey(next.expiryDate) < dayKey(next.publishDate)) throw statusError("Expiry date must be on or after the publish date", HttpStatus.BAD_REQUEST);
    // Only the owner decides what goes on the public website.
    if (!isOwnerLike(actor) && data.showOnWebsite) throw statusError("Only the owner can show notices on the website", HttpStatus.FORBIDDEN);
    return data;
  }

  static async createNotice(input: Record<string, any>, actor: StaffActor) {
    if (!actor.adminId || !actor.workType) throw statusError("Only an Owner or teacher can post notices", HttpStatus.FORBIDDEN);
    const defaults = { audience: actor.role === "teacher" ? "students" : "everyone", publishDate: todayKey() };
    const data = { adminId: actor.adminId, workType: actor.workType, createdBy: actor.userId, ...await this.prepare({ ...defaults, ...input, publishDate: input.publishDate || defaults.publishDate }, actor) };
    const myBatches = await teacherSectionIds(actor);
    if (!this.canManage(data, actor, myBatches)) throw statusError("Teachers can post notices to students of batches / sections they teach", HttpStatus.FORBIDDEN);
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const notice = await Notice.create({ ...data, noticeCode: generateSixDigitId() });
        return (await this.present([notice.toObject()], actor, myBatches))[0];
      } catch (error) {
        if (!(error.code === 11000 && error.keyPattern?.noticeCode) || attempt === 9) throw error;
      }
    }
    throw new Error("Unable to generate a unique notice ID");
  }

  private static async findNotice(identifier: string, actor: StaffActor) {
    const match = codeOrId(identifier, "noticeCode");
    if (!match) throw statusError("Invalid notice ID", HttpStatus.BAD_REQUEST);
    const notice = await Notice.findOne({ ...match, ...actorScope(actor) }).lean();
    const myBatches = await teacherSectionIds(actor);
    if (!notice || !this.canView(notice, actor, myBatches, await this.teacherCourses(myBatches))) throw statusError("Notice not found", HttpStatus.NOT_FOUND);
    return { notice, myBatches };
  }

  static async getAllNotices(actor: StaffActor) {
    const myBatches = await teacherSectionIds(actor);
    const myCourses = await this.teacherCourses(myBatches);
    const notices = (await Notice.find(actorScope(actor)).sort({ pinned: -1, publishDate: -1, createdAt: -1 }).lean())
      .filter(notice => this.canView(notice, actor, myBatches, myCourses));
    return this.present(notices, actor, myBatches);
  }

  static async getNotice(identifier: string, actor: StaffActor) {
    const { notice, myBatches } = await this.findNotice(identifier, actor);
    return (await this.present([notice], actor, myBatches))[0];
  }

  static async updateNotice(identifier: string, input: Record<string, any>, actor: StaffActor) {
    const { notice, myBatches } = await this.findNotice(identifier, actor);
    if (!this.canManage(notice, actor, myBatches)) throw statusError("You can edit only notices for batches / sections you teach", HttpStatus.FORBIDDEN);
    const update = await this.prepare(input, actor, notice);
    if (!this.canManage({ ...notice, ...update }, actor, myBatches)) throw statusError("Teachers can post notices to students of batches / sections they teach", HttpStatus.FORBIDDEN);
    const saved = await Notice.findByIdAndUpdate(notice._id, { $set: update }, { new: true, runValidators: true }).lean();
    return (await this.present([saved], actor, myBatches))[0];
  }

  static async deleteNotice(identifier: string, actor: StaffActor) {
    const { notice, myBatches } = await this.findNotice(identifier, actor);
    if (!this.canManage(notice, actor, myBatches)) throw statusError("You can delete only notices for batches / sections you teach", HttpStatus.FORBIDDEN);
    await Notice.deleteOne({ _id: notice._id });
    return { message: "Notice deleted successfully", notice };
  }

  private static async present(notices: Record<string, any>[], actor: StaffActor, myBatches: string[]) {
    if (!notices.length) return [];
    const courses = await Course.find({ _id: { $in: notices.map(notice => notice.courseId).filter(Boolean) } }).select("courseCode name").lean();
    const batches = await Batch.find({ _id: { $in: notices.flatMap(notice => notice.batchIds) } }).select("batchCode name").lean();
    const courseById = new Map(courses.map(course => [String(course._id), course]));
    const batchById = new Map(batches.map(batch => [String(batch._id), batch]));
    return notices.map(notice => {
      const course = notice.courseId ? courseById.get(String(notice.courseId)) : null;
      return {
        _id: notice._id, noticeCode: notice.noticeCode, workType: notice.workType, title: notice.title, description: notice.description,
        type: notice.type, audience: notice.audience,
        course: course ? { courseCode: course.courseCode, name: course.name } : null,
        batches: notice.batchIds.map(id => batchById.get(String(id))).filter(Boolean).map(batch => ({ batchCode: batch.batchCode, name: batch.name })),
        publishDate: notice.publishDate, expiryDate: notice.expiryDate, pinned: notice.pinned, showOnWebsite: notice.showOnWebsite,
        status: notice.status, state: noticeState(notice), canManage: this.canManage(notice, actor, myBatches), createdAt: notice.createdAt,
      };
    });
  }

  /** Live notices the owner chose to show on the public website, in the website's news-item shape. */
  static async websiteUpdates(adminId: unknown) {
    const notices = await Notice.find({ adminId, showOnWebsite: true, status: "published" }).sort({ pinned: -1, publishDate: -1 }).limit(20).lean();
    return notices.filter(notice => noticeState(notice) === "live").map(notice => ({
      title: notice.title, description: notice.description, type: TYPE_LABELS[notice.type] || "Notice",
      date: new Date(notice.publishDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }),
      status: "Published",
    }));
  }
}
