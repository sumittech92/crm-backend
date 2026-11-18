import HttpStatus from "http-status-codes";
import Salary from "../../model/salary/salary.js";
import Teacher from "../../model/teacher/teacherInfo.js";
import type { StaffScope } from "../../utilis/ownerScope.js";
import { parseDay, todayKey } from "../../utilis/ownerScope.js";
import { blankToNull, findScoped, insertWithCode, statusError } from "../../utilis/records.js";

const AMOUNTS = ["basic", "allowances", "bonus", "deductions"];
const TEXT = ["mode", "reference", "note"];

const round = (value: number) => Math.round(value * 100) / 100;

export class SalaryService {

  /** Net pay can't go below zero (deductions larger than the pay are rejected). */
  private static withNet(data: Record<string, any>) {
    const net = round((data.basic || 0) + (data.allowances || 0) + (data.bonus || 0) - (data.deductions || 0));
    if (net < 0) throw statusError("Deductions cannot be more than the total pay", HttpStatus.BAD_REQUEST);
    return { ...data, netPay: net };
  }

  /** Paid salaries keep a paid date (today when not given); pending ones drop the payment details. */
  private static payment(input: Record<string, any>, current: Record<string, any> = {}) {
    const status = input.status ?? current.status ?? "pending";
    if (status === "pending") return { status, paidOn: null, mode: null, reference: null };
    const data: Record<string, any> = { status };
    for (const field of TEXT) if (input[field] !== undefined) data[field] = blankToNull(input[field]);
    data.paidOn = input.paidOn ? parseDay(input.paidOn, "paid date") : current.paidOn ?? parseDay(todayKey(), "paid date");
    if (data.paidOn.toISOString().slice(0, 10) > todayKey()) throw statusError("Paid date cannot be in the future", HttpStatus.BAD_REQUEST);
    return data;
  }

  private static async teacherFor(teacherCode: string, scope: StaffScope) {
    const teacher = await Teacher.findOne({ teacherCode, ...scope }).select("teacherCode fullName").lean();
    if (!teacher) throw statusError("Teacher not found", HttpStatus.NOT_FOUND);
    return teacher;
  }

  /** Latest month first, then teacher name. */
  static async list(scope: StaffScope, { month, status, teacher }: { month?: string; status?: string; teacher?: string } = {}) {
    const filter: Record<string, any> = { ...scope };
    if (month) filter.month = month;
    if (status) filter.status = status;
    if (teacher) filter.teacherCode = teacher;
    return Salary.find(filter).sort({ month: -1, teacherName: 1 }).lean();
  }

  static async create(input: Record<string, any>, workType: string, adminId: unknown) {
    const teacher = await this.teacherFor(input.teacherCode, { workType: workType as StaffScope["workType"], adminId });
    if (await Salary.exists({ adminId, teacher: teacher._id, month: input.month })) {
      throw statusError(`Salary for ${teacher.fullName} for this month already exists`, HttpStatus.CONFLICT);
    }
    const amounts = Object.fromEntries(AMOUNTS.map(field => [field, Number(input[field]) || 0]));
    const created = await insertWithCode(Salary, "salaryCode", {
      ...this.withNet(amounts), ...this.payment(input), note: blankToNull(input.note),
      teacher: teacher._id, teacherCode: teacher.teacherCode, teacherName: teacher.fullName || "Teacher",
      month: input.month, adminId, workType,
    });
    return created.toObject();
  }

  static async update(identifier: string, input: Record<string, any>, scope: StaffScope) {
    const existing = await findScoped(Salary, "salaryCode", identifier, scope, "salary");
    const data: Record<string, any> = {};
    if (input.teacherCode && input.teacherCode !== existing.teacherCode) {
      const teacher = await this.teacherFor(input.teacherCode, scope);
      Object.assign(data, { teacher: teacher._id, teacherCode: teacher.teacherCode, teacherName: teacher.fullName || "Teacher" });
    }
    if (input.month) data.month = input.month;
    const teacherId = data.teacher ?? existing.teacher, month = data.month ?? existing.month;
    if ((data.teacher || data.month) && await Salary.exists({ _id: { $ne: existing._id }, adminId: existing.adminId, teacher: teacherId, month })) {
      throw statusError("This teacher already has a salary for that month", HttpStatus.CONFLICT);
    }
    const amounts = Object.fromEntries(AMOUNTS.map(field => [field, input[field] !== undefined ? Number(input[field]) || 0 : existing[field]]));
    Object.assign(data, this.withNet(amounts), this.payment(input, existing));
    if (input.note !== undefined) data.note = blankToNull(input.note);
    return Salary.findByIdAndUpdate(existing._id, { $set: data }, { new: true, runValidators: true }).lean();
  }

  static async remove(identifier: string, scope: StaffScope) {
    const existing = await findScoped(Salary, "salaryCode", identifier, scope, "salary");
    await Salary.deleteOne({ _id: existing._id });
    return { message: "Salary deleted successfully", salary: existing };
  }

  /**
   * Makes a pending salary for the month for every active teacher who doesn't have one yet,
   * copying basic pay, allowances and fixed deductions from their latest salary. Teachers never paid before are listed to add once.
   */
  static async generate(month: string, workType: string, adminId: unknown) {
    const teachers = await Teacher.find({ workType, adminId, status: { $in: ["active", "onLeave"] } }).select("teacherCode fullName").lean();
    const created: string[] = [], skipped: string[] = [];
    for (const teacher of teachers) {
      if (await Salary.exists({ adminId, teacher: teacher._id, month })) continue;
      const last = await Salary.findOne({ adminId, teacher: teacher._id, month: { $lt: month } }).sort({ month: -1 }).lean();
      if (!last) { skipped.push(teacher.fullName || teacher.teacherCode); continue; }
      await insertWithCode(Salary, "salaryCode", {
        ...this.withNet({ basic: last.basic, allowances: last.allowances, bonus: 0, deductions: last.deductions }),
        status: "pending", teacher: teacher._id, teacherCode: teacher.teacherCode, teacherName: teacher.fullName || "Teacher", month, adminId, workType,
      });
      created.push(teacher.fullName || teacher.teacherCode);
    }
    return { month, created: created.length, skipped };
  }
}
