import HttpStatus from "http-status-codes";
import mongoose from "mongoose";
import AuthModel from "../../model/Auth/auth.js";
import Teacher from "../../model/teacher/teacherInfo.js";
import { AuthClass } from "../Auth/auth.js";
import { generateSixDigitId } from "../../utilis/generateId.js";

export class TeacherInfoService {
  
  static async createTeacher( input: Record<string, any>, workType?: "school" | "coaching") {
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

  
  static async getTeacherById(teacherId: string, workType?: string) {
    const teacher = await this.findTeacherByIdentifier(teacherId, workType);
    if (!teacher) throw new Error("Teacher not found");
    return teacher;
  }

  static async findTeacherByIdentifier(identifier: string) {
  const value = String(identifier ?? "").trim();

  if (!value) {
    throw new Error("Teacher ID is required");
  }

  let teacher = null;

  // Generated teacher ID, e.g. "483921"
  if (/^\d{6}$/.test(value)) {
    teacher = await Teacher.findOne({ teacherCode: value });
  }

  // MongoDB document ID, e.g. "671a1234567890abcdef1234"
  else if (/^[a-fA-F0-9]{24}$/.test(value)) {
    teacher = await Teacher.findById(value);
  } else {
    throw new Error("Invalid Teacher ID");
  }

  if (!teacher) {
    throw new Error("Teacher not found");
  }

  return teacher;
}

static async getTeacherById(identifier: string) {
  return this.findTeacherByIdentifier(identifier);
}

  static async getAllTeachers(workType?: string) {
    return Teacher.find(workType ? { workType } : {}).sort({ createdAt: -1 });
  }

  static async updateTeacher(teacherId: string, input: Record<string, any>, workType?: string) {
    if (workType && ((workType === "school" && input.coachingInfo !== undefined) || (workType === "coaching" && input.schoolInfo !== undefined))) {
      throw new Error("Teacher data must match the admin work type");
    }
    const existingTeacher = await this.findTeacherByIdentifier(teacherId, workType);
    if (!existingTeacher) throw new Error("Teacher not found");
    const authId = existingTeacher.teacherId.toString();
    const allowedFields = ["fullName", "email", "countryCode", "phoneNumber", "joiningDate", "status", "profileImage", "gender", "schoolInfo", "coachingInfo"];
    const updateData: Record<string, any> = {};
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
    if (input.fullName !== undefined || input.email !== undefined || input.countryCode !== undefined || input.phoneNumber !== undefined) {
      await AuthModel.updateOne({ _id: authId }, {
        $set: {
          ...(input.fullName !== undefined && { fullName: input.fullName }),
          ...(input.email !== undefined && { email: input.email }),
          ...(input.countryCode !== undefined && { countryCode: input.countryCode }),
          ...(input.phoneNumber !== undefined && { phoneNumber: input.phoneNumber }),
        }
      });
    }
    return teacher;
  }

  static async deleteTeacher(teacherId: string, workType?: string) {
    const existingTeacher = await this.findTeacherByIdentifier(teacherId, workType);
    if (!existingTeacher) throw new Error("Teacher not found");
    const teacher = await Teacher.findByIdAndDelete(existingTeacher._id);
    if (!teacher) throw new Error("Teacher not found");
    await AuthModel.updateOne({ _id: existingTeacher.teacherId }, { $set: { isDeleted: true, accessToken: null } });
    return { message: "Teacher deleted successfully", teacher };
  }
}
