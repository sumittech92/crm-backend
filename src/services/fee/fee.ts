import HttpStatus from "http-status-codes";
import mongoose from "mongoose";
import FeeModel from "../../model/fee/fee.js";
import StudentDetailsModel from "../../model/students/studentInfo.js";
import { generateSixDigitId } from "../../utilis/generateId.js";
import { StaffScope, escapeRegex, parseDay, studentPlacement, todayKey } from "../../utilis/ownerScope.js";

export type FeeStatus = "Paid" | "Partial" | "Pending" | "Overdue";

interface CreateFeeInput { studentIds: string[]; period: string; totalFee: number; discount?: number; dueDate?: string | null; note?: string | null; }
interface UpdateFeeInput { totalFee?: number; discount?: number; dueDate?: string | null; note?: string | null; }
interface CollectFeeInput { studentIds: string[]; period: string; amount: number; discount?: number; mode: string; date: string; reference?: string | null; note?: string | null; totalFee?: number | null; dueDate?: string | null; }

const STUDENT_POPULATE = {
  path: "student",
  select: "studentCode fullName workType schoolInfo coachingInfo parentsInfo studentId",
  populate: { path: "studentId", select: "countryCode phoneNumber" },
};

const httpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

const dueOf = (fee: any) => Math.max(0, (fee.totalFee || 0) - (fee.discount || 0) - (fee.paidAmount || 0));

const statusOf = (fee: any): FeeStatus => {
  const due = dueOf(fee);
  if (due === 0) return "Paid";
  if (fee.dueDate && new Date(fee.dueDate).toISOString().slice(0, 10) < todayKey()) return "Overdue";
  return fee.paidAmount > 0 ? "Partial" : "Pending";
};

/** The shape the Fees page works with. */
export const presentFee = (fee: any) => {
  const student = fee.student || {};
  const payments = [...(fee.payments || [])].sort((a, b) => new Date(b.paidOn).getTime() - new Date(a.paidOn).getTime());
  const last = payments[0];
  const auth = student.studentId && typeof student.studentId === "object" ? student.studentId : null;
  const phone = auth?.phoneNumber ? `${auth.countryCode || ""}${auth.phoneNumber}` : student.parentsInfo?.phoneNumber ? `${student.parentsInfo.countryCode || ""}${student.parentsInfo.phoneNumber}` : "";
  return {
    id: fee._id,
    studentId: student.studentCode ?? null,
    student: student.fullName ?? "—",
    ...studentPlacement(student),
    phone,
    period: fee.period,
    totalFee: fee.totalFee,
    discount: fee.discount,
    paid: fee.paidAmount,
    due: dueOf(fee),
    status: statusOf(fee),
    dueDate: fee.dueDate ? new Date(fee.dueDate).toISOString().slice(0, 10) : null,
    note: fee.note,
    lastPayment: last ? { receiptNo: last.receiptNo, amount: last.amount, discount: last.discount, mode: last.mode, date: new Date(last.paidOn).toISOString().slice(0, 10), reference: last.reference } : null,
    payments: payments.map((payment) => ({ id: payment._id, receiptNo: payment.receiptNo, amount: payment.amount, discount: payment.discount, mode: payment.mode, date: new Date(payment.paidOn).toISOString().slice(0, 10), reference: payment.reference, note: payment.note })),
    createdAt: fee.createdAt,
  };
};

const receiptNo = (date: Date) => `RCPT-${date.getUTCFullYear()}-${generateSixDigitId()}`;

export class FeeService {
  /** Students in scope by 6-digit code; throws when any code is unknown. */
  private static async studentsByCode(scope: StaffScope, codes: string[]) {
    const unique = [...new Set(codes)];
    const students = await StudentDetailsModel.find({ ...scope, studentCode: { $in: unique } }).select("studentCode fullName workType adminId").lean();
    const byCode = new Map(students.map((student) => [student.studentCode, student]));
    const missing = unique.filter((code) => !byCode.has(code));
    if (missing.length) throw httpError(`Student not found: ${missing.join(", ")}`, HttpStatus.NOT_FOUND);
    return unique.map((code) => byCode.get(code));
  }

  private static async findFee(scope: StaffScope, feeId: string) {
    if (!mongoose.Types.ObjectId.isValid(feeId)) throw httpError("Invalid fee ID", HttpStatus.BAD_REQUEST);
    const filter: Record<string, unknown> = { _id: feeId };
    if (scope.adminId) filter.adminId = scope.adminId;
    const fee = await FeeModel.findOne(filter);
    if (!fee) throw httpError("Fee not found", HttpStatus.NOT_FOUND);
    return fee;
  }

  static async listFees(scope: StaffScope, query: { period?: string; status?: string; search?: string; studentId?: string }) {
    const filter: Record<string, unknown> = {};
    if (scope.adminId) filter.adminId = scope.adminId;
    if (scope.workType) filter.workType = scope.workType;
    if (query.period) filter.period = String(query.period);
    if (query.search?.trim() || query.studentId) {
      const studentFilter: Record<string, unknown> = { ...scope };
      if (query.studentId) studentFilter.studentCode = String(query.studentId);
      if (query.search?.trim()) {
        const pattern = new RegExp(escapeRegex(query.search.trim()), "i");
        studentFilter.$or = [{ fullName: pattern }, { studentCode: pattern }];
      }
      filter.student = { $in: await StudentDetailsModel.find(studentFilter).distinct("_id") };
    }
    const fees = await FeeModel.find(filter).populate(STUDENT_POPULATE).sort({ updatedAt: -1 }).lean();
    const rows = fees.map(presentFee);
    return query.status ? rows.filter((row) => row.status === query.status) : rows;
  }

  /** Numbers for the summary cards. */
  static async getSummary(scope: StaffScope) {
    const filter: Record<string, unknown> = {};
    if (scope.adminId) filter.adminId = scope.adminId;
    if (scope.workType) filter.workType = scope.workType;
    const fees = await FeeModel.find(filter).select("student totalFee discount paidAmount dueDate payments.amount payments.paidOn").lean();
    const today = todayKey();
    const month = today.slice(0, 7);
    let todayCollection = 0, monthCollection = 0, totalCollected = 0, pendingFees = 0, overdueFees = 0;
    const pendingStudents = new Set<string>();
    for (const fee of fees) {
      for (const payment of fee.payments || []) {
        const day = new Date(payment.paidOn).toISOString().slice(0, 10);
        totalCollected += payment.amount;
        if (day === today) todayCollection += payment.amount;
        if (day.startsWith(month)) monthCollection += payment.amount;
      }
      const due = dueOf(fee);
      if (due > 0) { pendingFees += due; pendingStudents.add(fee.student.toString()); }
      if (statusOf(fee) === "Overdue") overdueFees += due;
    }
    return { todayCollection, monthCollection, totalCollected, pendingFees, pendingStudentCount: pendingStudents.size, overdueFees, month };
  }

  static async getStudentFees(scope: StaffScope, studentCode: string) {
    const [student] = await this.studentsByCode(scope, [studentCode]);
    const fees = await FeeModel.find({ student: student._id }).populate(STUDENT_POPULATE).sort({ createdAt: -1 }).lean();
    return fees.map(presentFee);
  }

  /** Set up a fee (total for the month / term) for one or more students. Nothing is saved if any already has one. */
  static async createFee(scope: StaffScope, input: CreateFeeInput) {
    const students = await this.studentsByCode(scope, input.studentIds);
    const discount = input.discount || 0;
    if (discount > input.totalFee) throw httpError("Discount cannot be more than the total fee", HttpStatus.BAD_REQUEST);
    const dueDate = input.dueDate ? parseDay(input.dueDate, "due date") : null;
    const existing = await FeeModel.findOne({ student: { $in: students.map((student) => student._id) }, period: input.period }).populate("student", "fullName").lean();
    if (existing) throw httpError(`${(existing.student as any)?.fullName || "This student"} already has a fee for ${input.period}`, HttpStatus.CONFLICT);
    const created = await FeeModel.insertMany(students.map((student) => ({
      adminId: student.adminId ?? null,
      workType: student.workType,
      student: student._id,
      period: input.period,
      totalFee: input.totalFee,
      discount,
      dueDate,
      note: input.note || null,
    })));
    const fees = await FeeModel.find({ _id: { $in: created.map((fee) => fee._id) } }).populate(STUDENT_POPULATE).lean();
    return fees.map(presentFee);
  }

  /**
   * Record the same payment for one or more students for a month / term.
   * A student without a fee for that period gets one when `totalFee` is given.
   * Every student is checked before anything is saved.
   */
  static async collectFee(scope: StaffScope, collectedBy: unknown, input: CollectFeeInput) {
    const students = await this.studentsByCode(scope, input.studentIds);
    const paidOn = parseDay(input.date, "payment date");
    if (input.date > todayKey()) throw httpError("Payment date cannot be in the future", HttpStatus.BAD_REQUEST);
    const discount = input.discount || 0;
    if (input.amount + discount <= 0) throw httpError("Enter the amount received", HttpStatus.BAD_REQUEST);

    const fees = await FeeModel.find({ student: { $in: students.map((student) => student._id) }, period: input.period });
    const feeOf = new Map(fees.map((fee) => [fee.student.toString(), fee]));
    for (const student of students) {
      const fee = feeOf.get(student._id.toString());
      if (!fee) {
        if (input.totalFee == null) throw httpError(`No fee is set up for ${student.fullName} for ${input.period}. Enter the total fee.`, HttpStatus.BAD_REQUEST);
        if (input.amount + discount > input.totalFee) throw httpError(`Amount received plus discount cannot be more than the total fee of ₹${input.totalFee}`, HttpStatus.BAD_REQUEST);
        continue;
      }
      const due = dueOf(fee);
      if (due <= 0) throw httpError(`${student.fullName}'s fee for ${input.period} is already fully paid`, HttpStatus.BAD_REQUEST);
      if (input.amount + discount > due) throw httpError(`Amount received plus discount (₹${input.amount + discount}) cannot be more than the ₹${due} due for ${student.fullName} (${input.period})`, HttpStatus.BAD_REQUEST);
    }

    const dueDate = input.dueDate ? parseDay(input.dueDate, "due date") : null;
    const savedIds = [];
    for (const student of students) {
      const payment = { receiptNo: receiptNo(paidOn), amount: input.amount, discount, mode: input.mode, paidOn, reference: input.reference || null, note: input.note || null, collectedBy: collectedBy ?? null };
      let fee = feeOf.get(student._id.toString());
      if (!fee) {
        fee = new FeeModel({ adminId: student.adminId ?? null, workType: student.workType, student: student._id, period: input.period, totalFee: input.totalFee, discount: 0, paidAmount: 0, dueDate });
      }
      fee.paidAmount += input.amount;
      fee.discount += discount;
      fee.payments.push(payment as any);
      await fee.save();
      savedIds.push(fee._id);
    }
    const saved = await FeeModel.find({ _id: { $in: savedIds } }).populate(STUDENT_POPULATE).lean();
    return saved.map(presentFee);
  }

  static async updateFee(scope: StaffScope, feeId: string, input: UpdateFeeInput) {
    const fee = await this.findFee(scope, feeId);
    const totalFee = input.totalFee ?? fee.totalFee;
    const discount = input.discount ?? fee.discount;
    if (discount + fee.paidAmount > totalFee) throw httpError(`Total fee cannot be less than the amount already paid plus discount (₹${discount + fee.paidAmount})`, HttpStatus.BAD_REQUEST);
    fee.totalFee = totalFee;
    fee.discount = discount;
    if (input.dueDate !== undefined) fee.dueDate = input.dueDate ? parseDay(input.dueDate, "due date") : null;
    if (input.note !== undefined) fee.note = input.note || null;
    await fee.save();
    await fee.populate(STUDENT_POPULATE);
    return presentFee(fee.toObject());
  }

  static async deleteFee(scope: StaffScope, feeId: string) {
    const fee = await this.findFee(scope, feeId);
    if (fee.paidAmount > 0) throw httpError("This fee has payments recorded and cannot be deleted", HttpStatus.BAD_REQUEST);
    await FeeModel.deleteOne({ _id: fee._id });
    return { id: fee._id };
  }
}
