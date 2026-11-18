import HttpStatus from "http-status-codes";
import EntranceTest from "../../model/entrance/entrance.js";
import Admission, { openEnquiryStatuses } from "../../model/admission/admission.js";
import type { StaffScope } from "../../utilis/ownerScope.js";
import { parseDay, todayKey } from "../../utilis/ownerScope.js";
import { blankToNull, findScoped, insertWithCode, minutes, statusError } from "../../utilis/records.js";

const FIELDS = ["name", "className", "startTime", "endTime", "venue", "maxMarks", "passMarks", "instructions", "cancelled"];

export type EntranceStatus = "scheduled" | "completed" | "cancelled";
export type CandidateResult = "pending" | "qualified" | "notQualified";

export class EntranceService {

  static statusOf(test: Record<string, any>): EntranceStatus {
    if (test.cancelled) return "cancelled";
    return new Date(test.date).toISOString().slice(0, 10) < todayKey() ? "completed" : "scheduled";
  }

  private static present(test: Record<string, any>) {
    const candidates = (test.candidates || []).map(candidate => ({
      ...candidate,
      result: (candidate.marks == null ? "pending" : candidate.marks >= test.passMarks ? "qualified" : "notQualified") as CandidateResult,
    }));
    return {
      ...test, candidates, status: this.statusOf(test),
      qualified: candidates.filter(candidate => candidate.result === "qualified").length,
    };
  }

  private static prepare(input: Record<string, any>, current: Record<string, any> = {}) {
    const data: Record<string, any> = {};
    for (const field of FIELDS) if (input[field] !== undefined) data[field] = blankToNull(input[field]);
    if (input.date !== undefined) data.date = parseDay(input.date, "test date");
    const maxMarks = data.maxMarks ?? current.maxMarks, passMarks = data.passMarks ?? current.passMarks;
    if (passMarks > maxMarks) throw statusError("Pass marks cannot be more than max marks", HttpStatus.BAD_REQUEST);
    const start = data.startTime !== undefined ? data.startTime : current.startTime, end = data.endTime !== undefined ? data.endTime : current.endTime;
    if (start && end && minutes(end) <= minutes(start)) throw statusError("End time must be after the start time", HttpStatus.BAD_REQUEST);
    return data;
  }

  /** Upcoming tests first (soonest first), then past ones (latest first). */
  static async list(scope: StaffScope) {
    const today = todayKey();
    const key = (test: Record<string, any>) => new Date(test.date).toISOString().slice(0, 10);
    return (await EntranceTest.find(scope).lean()).map(test => this.present(test)).sort((a, b) => {
      const aPast = key(a) < today, bPast = key(b) < today;
      if (aPast !== bPast) return aPast ? 1 : -1;
      return aPast ? key(b).localeCompare(key(a)) : key(a).localeCompare(key(b));
    });
  }

  static async create(input: Record<string, any>, adminId: unknown) {
    const created = await insertWithCode(EntranceTest, "entranceCode", { ...this.prepare(input), adminId, workType: "school" });
    return this.present(created.toObject());
  }

  static async update(identifier: string, input: Record<string, any>, scope: StaffScope) {
    const existing = await findScoped(EntranceTest, "entranceCode", identifier, scope, "entrance test");
    const data = this.prepare(input, existing);
    const maxMarks = data.maxMarks ?? existing.maxMarks;
    if ((existing.candidates || []).some(candidate => candidate.marks != null && candidate.marks > maxMarks)) {
      throw statusError("Some candidates have more marks than the new max marks", HttpStatus.BAD_REQUEST);
    }
    const saved = await EntranceTest.findByIdAndUpdate(existing._id, { $set: data }, { new: true, runValidators: true }).lean();
    return this.present(saved);
  }

  /** Replaces the candidate list (with marks) in one save. */
  static async saveCandidates(identifier: string, candidates: Record<string, any>[], scope: StaffScope) {
    const existing = await findScoped(EntranceTest, "entranceCode", identifier, scope, "entrance test");
    if (candidates.some(candidate => candidate.marks != null && candidate.marks > existing.maxMarks)) {
      throw statusError(`Marks cannot be more than ${existing.maxMarks}`, HttpStatus.BAD_REQUEST);
    }
    const codes = candidates.map(candidate => candidate.enquiryCode).filter(Boolean);
    if (new Set(codes).size !== codes.length) throw statusError("An applicant is added twice", HttpStatus.BAD_REQUEST);
    const clean = candidates.map(candidate => ({
      enquiryCode: blankToNull(candidate.enquiryCode), studentName: candidate.studentName, parentName: blankToNull(candidate.parentName),
      phoneNumber: blankToNull(candidate.phoneNumber), marks: candidate.marks ?? null, remarks: blankToNull(candidate.remarks),
    }));
    const saved = await EntranceTest.findByIdAndUpdate(existing._id, { $set: { candidates: clean } }, { new: true, runValidators: true }).lean();
    return this.present(saved);
  }

  static async remove(identifier: string, scope: StaffScope) {
    const existing = await findScoped(EntranceTest, "entranceCode", identifier, scope, "entrance test");
    await EntranceTest.deleteOne({ _id: existing._id });
    return { message: "Entrance test deleted successfully", entrance: existing };
  }

  /** Open admission enquiries for a primary class, to add as candidates. */
  static async applicants(scope: StaffScope, className: string) {
    return Admission.find({ ...scope, className, status: { $in: openEnquiryStatuses } })
      .select("enquiryCode studentName parentName phoneNumber className status").sort({ studentName: 1 }).lean();
  }
}
