import HttpStatus from "http-status-codes";
import mongoose from "mongoose";
import FeeModel from "../../model/fee/fee.js";
import FeeSubmission from "../../model/fee/feeSubmission.js";
import FeeSettings from "../../model/fee/feeSettings.js";
import StudentDetailsModel from "../../model/students/studentInfo.js";
import { FeeService } from "./fee.js";
import { StaffScope, studentPlacement, todayKey } from "../../utilis/ownerScope.js";
import { isOwnStoredFile } from "../../utilis/storedFiles.js";
import { statusError } from "../../utilis/records.js";

/** Portal payment methods -> the payment modes the Fees module records. */
const PAYMENT_MODE: Record<string, string> = { UPI: "UPI", Card: "Card", "Net banking": "Net banking", "Bank Transfer": "Bank Transfer", "Cash at office": "Cash" };
const SETTINGS_FIELDS = ["upiId", "accountName", "accountNumber", "ifsc", "bankName", "note"];
const dueOf = (fee: Record<string, any>) => Math.max(0, (fee.totalFee || 0) - (fee.discount || 0) - (fee.paidAmount || 0));

export class FeeSubmissionService {

  private static present(submission: Record<string, any>, student?: Record<string, any>) {
    return {
      id: submission._id, studentId: student?.studentCode ?? null, student: student?.fullName ?? "—", ...(student ? studentPlacement(student) : {}),
      period: submission.period, amount: submission.amount, mode: submission.mode, reference: submission.reference, proof: submission.proof, note: submission.note,
      submittedBy: submission.submittedByName, submittedOn: submission.createdAt, status: submission.status,
      reviewNote: submission.reviewNote, reviewedAt: submission.reviewedAt, receiptNo: submission.receiptNo,
    };
  }

  private static async presentAll(submissions: Record<string, any>[]) {
    const students = new Map((await StudentDetailsModel.find({ _id: { $in: submissions.map(item => item.student) } }).select("studentCode fullName workType schoolInfo coachingInfo").lean()).map(student => [String(student._id), student]));
    return submissions.map(item => this.present(item, students.get(String(item.student))));
  }

  /** Owner: submissions of the institute, newest first. ?status=pending|approved|rejected */
  static async list(scope: StaffScope, { status }: { status?: string } = {}) {
    return this.presentAll(await FeeSubmission.find({ ...(scope.adminId ? { adminId: scope.adminId } : {}), ...(status ? { status } : {}) }).sort({ createdAt: -1 }).lean());
  }

  /** Portal: one student's submissions. */
  static async forStudent(student: Record<string, any>) {
    return this.presentAll(await FeeSubmission.find({ student: student._id }).sort({ createdAt: -1 }).lean());
  }

  /** Amount still payable for a period: the fee due minus payments already waiting for verification. */
  static async payable(student: Record<string, any>, period: string) {
    const fee = await FeeModel.findOne({ student: student._id, period }).lean();
    if (!fee) return null;
    const waiting = await FeeSubmission.aggregate([{ $match: { student: student._id, period, status: "pending" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
    return Math.max(0, dueOf(fee) - (waiting[0]?.total || 0));
  }

  static async submit(student: Record<string, any>, user: Record<string, any>, input: Record<string, any>) {
    const payable = await this.payable(student, input.period);
    if (payable === null) throw statusError(`No fee is set up for ${input.period}`, HttpStatus.BAD_REQUEST);
    if (payable <= 0) throw statusError(`Nothing is due for ${input.period}, or a payment for it is already waiting for verification`, HttpStatus.BAD_REQUEST);
    if (input.amount > payable) throw statusError(`Amount cannot be more than the ₹${payable.toLocaleString("en-IN")} due for ${input.period}`, HttpStatus.BAD_REQUEST);
    if (input.proof && !isOwnStoredFile(input.proof.url, "portal", student.adminId)) throw statusError("Upload the payment proof through the file upload first", HttpStatus.BAD_REQUEST);
    const created = await FeeSubmission.create({
      adminId: student.adminId, workType: student.workType, student: student._id, period: input.period, amount: input.amount, mode: input.mode,
      reference: input.reference || null, proof: input.proof || null, note: input.note || null,
      submittedBy: user._id, submittedByName: user.role === "parent" ? `${user.fullName || "Parent"} (Parent)` : user.fullName,
    });
    return this.present(created.toObject(), student);
  }

  private static async findPending(scope: StaffScope, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw statusError("Invalid submission ID", HttpStatus.BAD_REQUEST);
    const submission = await FeeSubmission.findOne({ _id: id, ...(scope.adminId ? { adminId: scope.adminId } : {}) }).lean();
    if (!submission) throw statusError("Payment submission not found", HttpStatus.NOT_FOUND);
    if (submission.status !== "pending") throw statusError(`This payment was already ${submission.status}`, HttpStatus.CONFLICT);
    return submission;
  }

  /** Records the payment on the student's fee (with a receipt) and marks the submission approved. */
  static async approve(scope: StaffScope, id: string, reviewer: unknown) {
    const submission = await this.findPending(scope, id);
    const student = await StudentDetailsModel.findById(submission.student).select("studentCode").lean();
    if (!student) throw statusError("Student not found", HttpStatus.NOT_FOUND);
    const [fee] = await FeeService.collectFee(scope, reviewer, {
      studentIds: [student.studentCode], period: submission.period, amount: submission.amount, mode: PAYMENT_MODE[submission.mode] || "UPI", date: todayKey(),
      reference: submission.reference, note: ["Paid through the portal", submission.note].filter(Boolean).join(" · "),
    });
    const saved = await FeeSubmission.findByIdAndUpdate(submission._id, { $set: { status: "approved", reviewNote: "Verified by the office", reviewedBy: reviewer, reviewedAt: new Date(), receiptNo: fee?.lastPayment?.receiptNo ?? null } }, { new: true }).lean();
    return { submission: (await this.presentAll([saved]))[0], fee };
  }

  static async reject(scope: StaffScope, id: string, reviewer: unknown, reason?: string | null) {
    const submission = await this.findPending(scope, id);
    const saved = await FeeSubmission.findByIdAndUpdate(submission._id, { $set: { status: "rejected", reviewNote: reason || "Could not verify this payment. Please contact the office.", reviewedBy: reviewer, reviewedAt: new Date() } }, { new: true }).lean();
    return (await this.presentAll([saved]))[0];
  }

  static async getSettings(adminId: unknown) {
    const settings = await FeeSettings.findOne({ adminId }).lean();
    return Object.fromEntries(SETTINGS_FIELDS.map(field => [field, settings?.[field] ?? null]));
  }

  static async saveSettings(adminId: unknown, input: Record<string, any>) {
    const data = Object.fromEntries(SETTINGS_FIELDS.filter(field => input[field] !== undefined).map(field => [field, String(input[field] ?? "").trim() || null]));
    await FeeSettings.updateOne({ adminId }, { $set: data }, { upsert: true, runValidators: true });
    return this.getSettings(adminId);
  }
}
