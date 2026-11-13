import HttpStatus from "http-status-codes";
import mongoose from "mongoose";
import AuthModel from "../../model/Auth/auth.js";
import StudentDetailsModel from "../../model/students/studentInfo.js";
import { AuthClass } from "../Auth/auth.js";
import { generateSixDigitId } from "../../utilis/generateId.js";
import type { OwnerScope } from "../teacher/teacherInfo.js";
import FeeModel from "../../model/fee/fee.js";
import AttendanceModel from "../../model/attendance/attendance.js";
import Batch from "../../model/teacher/batchModel.js";
import Course from "../../model/teacher/courseModel.js";
import { BatchService } from "../teacher/batchServices.js";
import { StaffActor, teacherSectionIds } from "../../utilis/staffAccess.js";
import { todayKey } from "../../utilis/ownerScope.js";

const statusError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

/** Discount / concession may not exceed the fee. */
const checkFeePlan = (plan: { amount?: number | null; discount?: number } | undefined) => {
  if (plan && plan.amount != null && (plan.discount || 0) > plan.amount) throw statusError("Discount cannot be more than the fee", HttpStatus.BAD_REQUEST);
};

export class StudentInfoService {
  static async createStudent(input: Record<string, any>, workType?: "school" | "coaching", adminId?: unknown) {
    workType ??= input.schoolInfo && !input.coachingInfo ? "school" : input.coachingInfo && !input.schoolInfo ? "coaching" : undefined;
    if (!workType || (workType === "school" && (!input.schoolInfo || input.coachingInfo)) || (workType === "coaching" && (!input.coachingInfo || input.schoolInfo))) {
      throw new Error("Student data must match the admin work type");
    }
    checkFeePlan(input.feePlan);
    const email = input.email.trim().toLowerCase();
    const countryCode = input.countryCode.trim();
    const phoneNumber = input.phoneNumber.trim();

    const existingUser = await AuthModel.exists({
      isDeleted: false,
      $or: [{ email }, { countryCode, phoneNumber }],
    });
    if (existingUser) {
      const error = new Error("Email or phone number already exists") as Error & { statusCode?: number };
      error.statusCode = HttpStatus.CONFLICT;
      throw error;
    }

    const auth = await AuthModel.create({
      fullName: input.fullName.trim(),
      email,
      countryCode,
      phoneNumber,
      password: await AuthClass.hashSecret(input.password),
      role: "student",
      workType,
    });

    let profile;
    try {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          profile = await StudentDetailsModel.create({
            workType,
            studentCode: generateSixDigitId(),
            studentId: auth._id,
            adminId: adminId ?? null,
            fullName: input.fullName.trim(),
            profileImage: input.profileImage,
            gender: input.gender,
            dateOfBirth: input.dateOfBirth ?? null,
            status: input.status ?? "active",
            feePlan: { amount: input.feePlan?.amount ?? null, discount: input.feePlan?.discount ?? 0 },
            parentsInfo: input.parentsInfo,
            address: input.address,
            schoolInfo: input.schoolInfo,
            coachingInfo: input.coachingInfo,
          });
          break;
        } catch (error) {
          if (error.code !== 11000 || !error.keyPattern?.studentCode || attempt === 9) throw error;
        }
      }
      if (input.parentLogin?.enabled) await this.linkParent(profile.toObject(), input.parentLogin.password);
      const safeAuth = auth.toObject();
      delete safeAuth.password;
      return { id: profile.studentCode, user: safeAuth, student: profile };
    } catch (error) {
      if (profile) await StudentDetailsModel.deleteOne({ _id: profile._id });
      await AuthModel.deleteOne({ _id: auth._id });
      throw error;
    }
  }

  static async getStudentById(studentId: string, scope: OwnerScope = {}) {
    const student = await this.findStudentByIdentifier(studentId, scope);
    if (!student) throw new Error("Student not found");
    return student;
  }

  private static async findStudentByIdentifier(identifier: string, scope: OwnerScope = {}) {
    if (/^\d{6}$/.test(identifier)) return StudentDetailsModel.findOne({ studentCode: identifier, ...scope });
    if (!mongoose.Types.ObjectId.isValid(identifier)) throw new Error("Invalid Student ID");
    return StudentDetailsModel.findOne({ studentId: identifier, ...scope });
  }

  static async getAllStudents(scope: OwnerScope = {}) {
    return StudentDetailsModel.find(scope).sort({ createdAt: -1 });
  }

  static async updateStudent(studentId: string, input: Record<string, any>, scope: OwnerScope = {}) {
    const { workType } = scope;
    if (workType && ((workType === "school" && input.coachingInfo !== undefined) || (workType === "coaching" && input.schoolInfo !== undefined))) {
      throw new Error("Student data must match the admin work type");
    }
    const existingStudent = await this.findStudentByIdentifier(studentId, scope);
    if (!existingStudent) throw new Error("Student not found");
    const authId = existingStudent.studentId.toString();
    if (input.password) await AuthClass.resetPassword(authId, input.password);
    // Parent login follows the parent mobile: link (or re-link after a number change) before saving, so a problem stops the save.
    const parentsInfo = { ...existingStudent.toObject().parentsInfo, ...(input.parentsInfo || {}) };
    const wantsParent = input.parentLogin ? input.parentLogin.enabled : !!existingStudent.parentId;
    if (wantsParent) await this.linkParent({ ...existingStudent.toObject(), parentsInfo }, input.parentLogin?.password);
    else if (existingStudent.parentId) await this.unlinkParent(existingStudent.toObject());
    if (input.feePlan !== undefined) checkFeePlan({ ...existingStudent.toObject().feePlan, ...input.feePlan });
    const profileFields = ["fullName", "profileImage", "gender", "dateOfBirth", "status", "feePlan", "parentsInfo", "address", "schoolInfo", "coachingInfo"];
    const profileUpdate: Record<string, any> = {};
    for (const field of profileFields) if (input[field] !== undefined) profileUpdate[field] = input[field];

    const accountUpdate: Record<string, any> = {};
    for (const field of ["fullName", "email", "countryCode", "phoneNumber"]) {
      if (input[field] !== undefined) accountUpdate[field] = field === "email" ? input[field].trim().toLowerCase() : input[field];
    }
    if (Object.keys(accountUpdate).length) {
      const duplicateConditions = [];
      if (accountUpdate.email) duplicateConditions.push({ email: accountUpdate.email });
      const nextCountryCode = accountUpdate.countryCode;
      const nextPhoneNumber = accountUpdate.phoneNumber;
      if (nextCountryCode || nextPhoneNumber) {
        const currentAuth = await AuthModel.findById(authId).select("countryCode phoneNumber").lean();
        duplicateConditions.push({
          countryCode: nextCountryCode ?? currentAuth?.countryCode,
          phoneNumber: nextPhoneNumber ?? currentAuth?.phoneNumber,
        });
      }
      if (duplicateConditions.length && await AuthModel.exists({
        _id: { $ne: authId }, isDeleted: false, $or: duplicateConditions,
      })) {
        const error = new Error("Email or phone number already exists") as Error & { statusCode?: number };
        error.statusCode = HttpStatus.CONFLICT;
        throw error;
      }
      await AuthModel.updateOne({ _id: authId, role: "student", isDeleted: false }, { $set: accountUpdate });
    }
    const student = await StudentDetailsModel.findOneAndUpdate(
      { _id: existingStudent._id }, { $set: profileUpdate }, { new: true, runValidators: true },
    );
    return student;
  }

  static async deleteStudent(studentId: string, scope: OwnerScope = {}) {
    const existingStudent = await this.findStudentByIdentifier(studentId, scope);
    if (!existingStudent) throw new Error("Student not found");
    const student = await StudentDetailsModel.findByIdAndDelete(existingStudent._id);
    if (!student) throw new Error("Student not found");
    await AuthModel.updateOne({ _id: existingStudent.studentId, role: "student" }, { $set: { isDeleted: true, accessToken: null } });
    if (existingStudent.parentId) await this.removeParentIfUnused(existingStudent.parentId);
    return { message: "Student deleted successfully", student };
  }

  /** The teacher's sections / batches with their class / course names, for matching students. */
  private static async teacherBatches(actor: StaffActor) {
    const batches = await Batch.find({ _id: { $in: await teacherSectionIds(actor) } }).lean();
    const courses = new Map((await Course.find({ _id: { $in: batches.map(batch => batch.courseId) } }).select("name").lean()).map(course => [String(course._id), course.name]));
    return batches.map(batch => ({ batch, courseName: courses.get(String(batch.courseId)) }));
  }

  /** Owners see every student of the institute; teachers only students of their sections / batches (also used by attendance). */
  static async visibleTo(students: Record<string, any>[], actor: StaffActor) {
    if (actor.role !== "teacher") return students;
    const batches = await this.teacherBatches(actor);
    return students.filter(student => batches.some(({ batch, courseName }) => BatchService.studentInBatch(student, batch, courseName)));
  }

  /**
   * Adds the login email / mobile, fee status (from Fees records) and attendance % (from Attendance records).
   * Teachers do not get fee details.
   */
  private static async present(students: Record<string, any>[], actor: StaffActor) {
    if (!students.length) return [];
    const ids = students.map(student => student._id);
    const owner = actor.role !== "teacher";
    const [accounts, fees, attendance] = await Promise.all([
      AuthModel.find({ _id: { $in: students.map(student => student.studentId) } }).select("email countryCode phoneNumber").lean(),
      owner ? FeeModel.find({ student: { $in: ids } }).select("student totalFee discount paidAmount dueDate").lean() : Promise.resolve([]),
      AttendanceModel.aggregate([
        { $match: { student: { $in: ids } } },
        { $group: { _id: "$student", total: { $sum: 1 }, came: { $sum: { $cond: [{ $in: ["$status", ["present", "late"]] }, 1, 0] } } } },
      ]),
    ]);
    const accountById = new Map(accounts.map(account => [String(account._id), account]));
    const attendanceById = new Map(attendance.map(row => [String(row._id), row]));
    const today = todayKey();
    return students.map(student => {
      const account = accountById.get(String(student.studentId));
      const marks = attendanceById.get(String(student._id));
      const row: Record<string, any> = {
        ...student,
        email: account?.email ?? null, countryCode: account?.countryCode ?? null, phoneNumber: account?.phoneNumber ?? null,
        attendance: marks?.total ? Math.round((marks.came / marks.total) * 100) : null,
      };
      if (!owner) {
        delete row.feePlan;
        return row;
      }
      const own = fees.filter(fee => String(fee.student) === String(student._id));
      const due = own.map(fee => ({ amount: Math.max(0, (fee.totalFee || 0) - (fee.discount || 0) - (fee.paidAmount || 0)), dueDate: fee.dueDate }));
      const feeDue = due.reduce((sum, fee) => sum + fee.amount, 0);
      const overdue = due.some(fee => fee.amount > 0 && fee.dueDate && new Date(fee.dueDate).toISOString().slice(0, 10) < today);
      return { ...row, feeDue, feeStatus: overdue ? "overdue" : feeDue > 0 ? "pending" : "paid" };
    });
  }

  static async listFor(scope: OwnerScope, actor: StaffActor) {
    const students = await StudentDetailsModel.find(scope).sort({ createdAt: -1 }).lean();
    return this.present(await this.visibleTo(students, actor), actor);
  }

  static async getFor(studentId: string, scope: OwnerScope, actor: StaffActor) {
    const student = await this.findStudentByIdentifier(studentId, scope);
    if (!student) throw new Error("Student not found");
    const [visible] = await this.visibleTo([student.toObject()], actor);
    if (!visible) throw new Error("Student not found");
    return (await this.present([visible], actor))[0];
  }

  /**
   * Gives the student's parent a login on the parent mobile. Siblings with the same parent mobile share one parent account;
   * a new account needs a password, an existing one keeps its password unless a new one is given.
   */
  private static async linkParent(student: Record<string, any>, password?: string | null) {
    const phoneNumber = String(student.parentsInfo?.phoneNumber || "").trim();
    const countryCode = String(student.parentsInfo?.countryCode || "+91").trim();
    if (!phoneNumber) throw statusError("Add the parent's mobile number to give the parent a login", HttpStatus.BAD_REQUEST);
    let parent = await AuthModel.findOne({ role: "parent", countryCode, phoneNumber, isDeleted: false });
    if (!parent) {
      if (!password) throw statusError("Set a password for the parent login", HttpStatus.BAD_REQUEST);
      if (await AuthModel.exists({ isDeleted: false, countryCode, phoneNumber })) throw statusError("The parent mobile number is already used by another account", HttpStatus.CONFLICT);
      parent = await AuthModel.create({
        fullName: student.parentsInfo?.fatherName || student.parentsInfo?.motherName || "Parent", countryCode, phoneNumber,
        password: await AuthClass.hashSecret(password), role: "parent", workType: student.workType,
      });
    } else if (password) {
      await AuthModel.updateOne({ _id: parent._id }, { $set: { password: await AuthClass.hashSecret(password), failedLoginAttempts: 0 } });
    }
    const previous = student.parentId && String(student.parentId) !== String(parent._id) ? student.parentId : null;
    await StudentDetailsModel.updateOne({ _id: student._id }, { $set: { parentId: parent._id } });
    if (previous) await this.removeParentIfUnused(previous);
  }

  private static async unlinkParent(student: Record<string, any>) {
    await StudentDetailsModel.updateOne({ _id: student._id }, { $set: { parentId: null } });
    await this.removeParentIfUnused(student.parentId);
  }

  /** A parent account with no children left is closed. */
  private static async removeParentIfUnused(parentId: unknown) {
    if (await StudentDetailsModel.exists({ parentId })) return;
    await AuthModel.updateOne({ _id: parentId, role: "parent" }, { $set: { isDeleted: true, accessToken: null } });
  }
}
