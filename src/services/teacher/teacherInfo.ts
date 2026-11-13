import HttpStatus from "http-status-codes";
import mongoose from "mongoose";
import AuthModel from "../../model/Auth/auth.js";
import Teacher from "../../model/teacher/teacherInfo.js";
import Subject from "../../model/subject/subject.js";
import { AuthClass } from "../Auth/auth.js";
import { generateSixDigitId } from "../../utilis/generateId.js";

/** Limits an admin to records of their own work type that they created. Empty for super admins. */
export type OwnerScope = { workType?: string; adminId?: unknown };

export class TeacherInfoService {
  
  static async createTeacher( input: Record<string, any>, workType?: "school" | "coaching", adminId?: unknown) {
    // 1. Resolve and validate work type
    workType ??=
      input.schoolInfo && !input.coachingInfo ? "school" : input.coachingInfo && !input.schoolInfo? "coaching": undefined;

    if (
      !workType ||
      (workType === "school" &&
        (!input.schoolInfo || input.coachingInfo)) ||
      (workType === "coaching" &&
        (!input.coachingInfo || input.schoolInfo))
    ) {
      throw new Error("Teacher data must match the admin work type");
    }

    // 2. Normalize common fields
    const email = input.email?.trim().toLowerCase();
    const countryCode = input.countryCode?.trim();
    const phoneNumber = input.phoneNumber?.trim();
    const fullName = input.fullName?.trim();

    if (!fullName || !email || !countryCode || !phoneNumber || !input.password) {
      throw new Error(
        "Full name, email, country code, phone number and password are required"
      );
    }

    // 3. Check duplicate email or phone
    const existingUser = await AuthModel.exists({
      isDeleted: false,
      $or: [
        { email },
        { countryCode, phoneNumber },
      ],
    });

    if (existingUser) {
      const error = new Error(
        "Email or phone number already exists"
      ) as Error & { statusCode?: number };

      error.statusCode = HttpStatus.CONFLICT;
      throw error;
    }

    // 4. Create authentication user
    const auth = await AuthModel.create({
      fullName,
      email,
      countryCode,
      phoneNumber,
      password: await AuthClass.hashSecret(input.password),
      role: "teacher",
      workType,
    });

    try {
      let teacher = null;

      // 5. Generate teacherCode automatically
      // Retry if the generated code already exists
      for (let attempt = 0; attempt < 10; attempt++) {
        const teacherCode = generateSixDigitId();

        try {
          teacher = await Teacher.create({
            workType,
            teacherCode,
            teacherId: auth._id,
            adminId: adminId ?? null,

            fullName,
            email,
            countryCode,
            phoneNumber,

            joiningDate: input.joiningDate,
            status: input.status ?? "pending",
            profileImage: input.profileImage,
            gender: input.gender,

            schoolInfo:
              workType === "school"
                ? {
                  ...input.schoolInfo,
                  employeeId: teacherCode,
                }
                : undefined,

            coachingInfo:
              workType === "coaching"
                ? input.coachingInfo
                : undefined,
          });

          break;
        } catch (error: any) {
          const isGeneratedIdCollision =
            error.code === 11000 &&
            error.keyPattern?.teacherCode;

          if (!isGeneratedIdCollision || attempt === 9) {
            throw error;
          }
        }
      }

      if (!teacher) {
        throw new Error("Unable to generate a unique teacher ID");
      }

      // 6. Remove password from returned user object
      const safeAuth = auth.toObject();
      delete safeAuth.password;

      // 7. Return generated teacher ID
      return {
        id: teacher.teacherCode,
        user: safeAuth,
        teacher,
      };
    } catch (error) {
      // 8. Roll back user creation if teacher creation fails
      await AuthModel.deleteOne({ _id: auth._id });
      throw error;
    }
  }

  static async getTeacherById(teacherId: string, scope: OwnerScope = {}) {
    const teacher = await this.findTeacherByIdentifier(teacherId, scope);
    if (!teacher) throw new Error("Teacher not found");
    return teacher;
  }

  // Accepts the generated teacher code ("483921") or the profile's MongoDB _id.
  // An admin only sees teachers of their own work type that they created.
  private static async findTeacherByIdentifier(identifier: string, scope: OwnerScope = {}) {
    const value = String(identifier ?? "").trim();
    if (/^\d{6}$/.test(value)) return Teacher.findOne({ teacherCode: value, ...scope });
    if (!mongoose.Types.ObjectId.isValid(value)) throw new Error("Invalid Teacher ID");
    return Teacher.findOne({ _id: value, ...scope });
  }

  static async getAllTeachers(scope: OwnerScope = {}) {
    return Teacher.find(scope).sort({ createdAt: -1 });
  }

  static async updateTeacher(teacherId: string, input: Record<string, any>, scope: OwnerScope = {}) {
    const { workType } = scope;
    if (workType && ((workType === "school" && input.coachingInfo !== undefined) || (workType === "coaching" && input.schoolInfo !== undefined))) {
      throw new Error("Teacher data must match the admin work type");
    }
    const existingTeacher = await this.findTeacherByIdentifier(teacherId, scope);
    if (!existingTeacher) throw new Error("Teacher not found");
    const authId = existingTeacher.teacherId.toString();

    const accountUpdate: Record<string, any> = {};
    for (const field of ["fullName", "email", "countryCode", "phoneNumber"]) {
      if (input[field] !== undefined) accountUpdate[field] = field === "email" ? input[field].trim().toLowerCase() : input[field].trim();
    }
    if (Object.keys(accountUpdate).length) {
      const duplicateConditions = [];
      if (accountUpdate.email) duplicateConditions.push({ email: accountUpdate.email });
      if (accountUpdate.countryCode || accountUpdate.phoneNumber) {
        duplicateConditions.push({
          countryCode: accountUpdate.countryCode ?? existingTeacher.countryCode,
          phoneNumber: accountUpdate.phoneNumber ?? existingTeacher.phoneNumber,
        });
      }
      if (duplicateConditions.length && await AuthModel.exists({
        _id: { $ne: authId }, isDeleted: false, $or: duplicateConditions,
      })) {
        const error = new Error("Email or phone number already exists") as Error & { statusCode?: number };
        error.statusCode = HttpStatus.CONFLICT;
        throw error;
      }
    }

    if (input.password) await AuthClass.resetPassword(authId, input.password);
    const allowedFields = ["joiningDate", "status", "profileImage", "gender", "schoolInfo", "coachingInfo"];
    const updateData: Record<string, any> = { ...accountUpdate };
    for (const field of allowedFields) {
      if (input[field] !== undefined) updateData[field] = input[field];
    }
    if (updateData.schoolInfo) {
      const { employeeId: _ignoredEmployeeId, ...schoolInfo } = updateData.schoolInfo;
      updateData.schoolInfo = {
        ...schoolInfo,
        employeeId: existingTeacher.schoolInfo?.employeeId ?? existingTeacher.teacherCode ?? generateSixDigitId(),
      };
    }
    const teacher = await Teacher.findByIdAndUpdate(existingTeacher._id, { $set: updateData }, { new: true, runValidators: true });
    if (!teacher) throw new Error("Teacher not found");
    if (Object.keys(accountUpdate).length) {
      await AuthModel.updateOne({ _id: authId, role: "teacher", isDeleted: false }, { $set: accountUpdate });
    }
    return teacher;
  }

  static async deleteTeacher(teacherId: string, scope: OwnerScope = {}) {
    const existingTeacher = await this.findTeacherByIdentifier(teacherId, scope);
    if (!existingTeacher) throw new Error("Teacher not found");
    const teacher = await Teacher.findByIdAndDelete(existingTeacher._id);
    if (!teacher) throw new Error("Teacher not found");
    await AuthModel.updateOne({ _id: existingTeacher.teacherId, role: "teacher" }, { $set: { isDeleted: true, accessToken: null } });
    // Their subjects stay, marked "not assigned" in each section until the owner picks another teacher.
    await Subject.updateMany({ "sections.teacherId": existingTeacher._id }, { $set: { "sections.$[section].teacherId": null } }, { arrayFilters: [{ "section.teacherId": existingTeacher._id }] });
    return { message: "Teacher deleted successfully", teacher };
  }
}
