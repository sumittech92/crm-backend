import HttpStatus from "http-status-codes";
import mongoose from "mongoose";
import AuthModel from "../../model/Auth/auth.js";
import StudentDetailsModel from "../../model/students/studentInfo.js";
import { AuthClass } from "../Auth/auth.js";
import { generateSixDigitId } from "../../utilis/generateId.js";

export class StudentInfoService {
  static async createStudent(input: Record<string, any>, workType?: "school" | "coaching") {
    workType ??= input.schoolInfo && !input.coachingInfo ? "school" : input.coachingInfo && !input.schoolInfo ? "coaching" : undefined;
    if (!workType || (workType === "school" && (!input.schoolInfo || input.coachingInfo)) || (workType === "coaching" && (!input.coachingInfo || input.schoolInfo))) {
      throw new Error("Student data must match the admin work type");
    }
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
    });

    try {
      let profile;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          profile = await StudentDetailsModel.create({
            workType,
            studentCode: generateSixDigitId(),
            studentId: auth._id,
            fullName: input.fullName.trim(),
            profileImage: input.profileImage,
            gender: input.gender,
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
      const safeAuth = auth.toObject();
      delete safeAuth.password;
      return { id: profile.studentCode, user: safeAuth, student: profile };
    } catch (error) {
      await AuthModel.deleteOne({ _id: auth._id });
      throw error;
    }
  }

  static async getStudentById(studentId: string, workType?: string) {
    const student = await this.findStudentByIdentifier(studentId, workType);
    if (!student) throw new Error("Student not found");
    return student;
  }

  private static async findStudentByIdentifier(identifier: string, workType?: string) {
    const scope = workType ? { workType } : {};
    if (/^\d{6}$/.test(identifier)) return StudentDetailsModel.findOne({ studentCode: identifier, ...scope });
    if (!mongoose.Types.ObjectId.isValid(identifier)) throw new Error("Invalid Student ID");
    return StudentDetailsModel.findOne({ studentId: identifier, ...scope });
  }

  static async getAllStudents(workType?: string) {
    return StudentDetailsModel.find(workType ? { workType } : {}).sort({ createdAt: -1 });
  }

  static async updateStudent(studentId: string, input: Record<string, any>, workType?: string) {
    if (workType && ((workType === "school" && input.coachingInfo !== undefined) || (workType === "coaching" && input.schoolInfo !== undefined))) {
      throw new Error("Student data must match the admin work type");
    }
    const existingStudent = await this.findStudentByIdentifier(studentId, workType);
    if (!existingStudent) throw new Error("Student not found");
    const authId = existingStudent.studentId.toString();
    const profileFields = ["fullName", "profileImage", "gender", "parentsInfo", "address", "schoolInfo", "coachingInfo"];
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

  static async deleteStudent(studentId: string, workType?: string) {
    const existingStudent = await this.findStudentByIdentifier(studentId, workType);
    if (!existingStudent) throw new Error("Student not found");
    const student = await StudentDetailsModel.findByIdAndDelete(existingStudent._id);
    if (!student) throw new Error("Student not found");
    await AuthModel.updateOne({ _id: existingStudent.studentId, role: "student" }, { $set: { isDeleted: true, accessToken: null } });
    return { message: "Student deleted successfully", student };
  }
}
