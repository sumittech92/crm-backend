import HttpStatus from "http-status-codes";
import mongoose from "mongoose";
import AuthModel from "../../model/Auth/auth.js";
import Admission, { openEnquiryStatuses } from "../../model/admission/admission.js";
import Website from "../../model/website/website.js";
import type { OwnerScope } from "../teacher/teacherInfo.js";
import { generateSixDigitId } from "../../utilis/generateId.js";

const statusError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const blankToNull = (value: unknown) => typeof value === "string" && !value.trim() ? null : value;
const ENQUIRY_FIELDS = ["studentName", "parentName", "countryCode", "phoneNumber", "email", "className", "previousSchool", "message", "source", "status", "enquiryDate", "followUpDate"];

export class AdmissionService {

  /** The owner behind a public website address; blocked / deleted owners and hidden websites stop accepting enquiries. */
  static async findSiteOwner(siteSlug: string) {
    const owner = await AuthModel.findOne({ siteSlug: String(siteSlug ?? "").trim().toLowerCase(), role: "admin", isDeleted: false, isBlocked: false })
      .select("fullName instituteName workType siteSlug").lean();
    // Hidden (unpublished) websites do not take enquiries.
    if (!owner || !owner.workType || !await Website.exists({ adminId: owner._id, isPublished: true })) throw statusError("This website is not accepting enquiries right now. Please call the institute.", HttpStatus.NOT_FOUND);
    return owner;
  }

  static async getPublicSite(siteSlug: string) {
    const owner = await this.findSiteOwner(siteSlug);
    return { siteSlug: owner.siteSlug, instituteName: owner.instituteName || owner.fullName, workType: owner.workType };
  }

  /** Website form: refreshes the visitor's open enquiry (same mobile) instead of adding a duplicate. */
  static async submitPublicEnquiry(siteSlug: string, input: Record<string, any>) {
    const owner = await this.findSiteOwner(siteSlug);
    const fields = {
      studentName: input.studentName, parentName: input.parentName, email: blankToNull(input.email),
      className: input.className, message: blankToNull(input.message),
    };
    const open = await Admission.findOneAndUpdate(
      { adminId: owner._id, countryCode: input.countryCode, phoneNumber: input.phoneNumber, status: { $in: openEnquiryStatuses } },
      { $set: { ...fields, status: "new", enquiryDate: new Date() } },
      { new: true, sort: { updatedAt: -1 } },
    );
    if (open) return { enquiry: open, updated: true };
    const enquiry = await this.insertWithCode({
      ...fields, countryCode: input.countryCode, phoneNumber: input.phoneNumber,
      adminId: owner._id, workType: owner.workType, source: "website", status: "new",
    });
    return { enquiry, updated: false };
  }

  static async createEnquiry(input: Record<string, any>, workType: string, adminId: unknown) {
    if (await Admission.exists({ adminId, countryCode: input.countryCode, phoneNumber: input.phoneNumber, status: { $in: openEnquiryStatuses } })) {
      throw statusError("An open enquiry already exists for this mobile number", HttpStatus.CONFLICT);
    }
    const data: Record<string, any> = { adminId, workType };
    for (const field of ENQUIRY_FIELDS) if (input[field] !== undefined) data[field] = blankToNull(input[field]);
    data.source ??= "walkIn";
    return this.insertWithCode(data);
  }

  // Retry if the generated enquiry code already exists.
  private static async insertWithCode(data: Record<string, any>) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        return await Admission.create({ ...data, enquiryCode: generateSixDigitId() });
      } catch (error) {
        if (!(error.code === 11000 && error.keyPattern?.enquiryCode) || attempt === 9) throw error;
      }
    }
    throw new Error("Unable to generate a unique enquiry ID");
  }

  // Accepts the 6-digit enquiry code or the MongoDB _id, limited to the owner's own enquiries.
  private static async findByIdentifier(identifier: string, scope: OwnerScope = {}) {
    const value = String(identifier ?? "").trim();
    if (/^\d{6}$/.test(value)) return Admission.findOne({ enquiryCode: value, ...scope });
    if (!mongoose.Types.ObjectId.isValid(value)) throw statusError("Invalid Enquiry ID", HttpStatus.BAD_REQUEST);
    return Admission.findOne({ _id: value, ...scope });
  }

  static async getEnquiryById(identifier: string, scope: OwnerScope = {}) {
    const enquiry = await this.findByIdentifier(identifier, scope);
    if (!enquiry) throw statusError("Enquiry not found", HttpStatus.NOT_FOUND);
    return enquiry;
  }

  static async getAllEnquiries(scope: OwnerScope = {}, { status }: { status?: string } = {}) {
    return Admission.find({ ...scope, ...(status ? { status } : {}) }).sort({ enquiryDate: -1, createdAt: -1 });
  }

  static async updateEnquiry(identifier: string, input: Record<string, any>, scope: OwnerScope = {}) {
    const existing = await this.getEnquiryById(identifier, scope);
    const update: Record<string, any> = {};
    for (const field of ENQUIRY_FIELDS) if (input[field] !== undefined) update[field] = blankToNull(input[field]);
    const countryCode = update.countryCode ?? existing.countryCode;
    const phoneNumber = update.phoneNumber ?? existing.phoneNumber;
    const status = update.status ?? existing.status;
    if (openEnquiryStatuses.includes(status) && await Admission.exists({
      _id: { $ne: existing._id }, adminId: existing.adminId, countryCode, phoneNumber, status: { $in: openEnquiryStatuses },
    })) {
      throw statusError("An open enquiry already exists for this mobile number", HttpStatus.CONFLICT);
    }
    return Admission.findByIdAndUpdate(existing._id, { $set: update }, { new: true, runValidators: true });
  }

  static async deleteEnquiry(identifier: string, scope: OwnerScope = {}) {
    const existing = await this.getEnquiryById(identifier, scope);
    await Admission.deleteOne({ _id: existing._id });
    return { message: "Enquiry deleted successfully", enquiry: existing };
  }
}
