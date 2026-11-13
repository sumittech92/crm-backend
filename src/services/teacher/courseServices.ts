import HttpStatus from "http-status-codes";
import mongoose from "mongoose";
import Course, { coachingFeeFrequencies, schoolFeeFrequencies } from "../../model/teacher/courseModel.js";
import StudentDetailsModel from "../../model/students/studentInfo.js";
import Batch from "../../model/teacher/batchModel.js";
import Test from "../../model/test/test.js";
import Material from "../../model/material/material.js";
import Subject from "../../model/subject/subject.js";
import Syllabus, { SyllabusProgress } from "../../model/syllabus/syllabus.js";
import type { StaffScope } from "../../utilis/ownerScope.js";
import { escapeRegex } from "../../utilis/ownerScope.js";
import { generateSixDigitId } from "../../utilis/generateId.js";

const statusError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const blankToNull = (value: unknown) => typeof value === "string" && !value.trim() ? null : value;
const COURSE_FIELDS = ["name", "description", "duration", "feeAmount", "feeFrequency", "subjects", "status"];

/** Schools pick their classes from a fixed list (same list as the panel). */
export const SCHOOL_CLASSES = ["Nursery", "LKG", "UKG", ...Array.from({ length: 12 }, (_, index) => `Class ${index + 1}`)];

/** Where a student's course / class name is stored for each work type. Coaching students may join several courses ("A, B"). */
const studentCourseField = (workType: string) => workType === "school" ? "schoolInfo.className" : "coachingInfo.course";
const nameInListRegex = (name: string) => new RegExp(`(^|,)\\s*${escapeRegex(name)}\\s*(,|$)`, "i");

export class CourseService {

  /** Fee frequency and (for schools) class name must suit the institute type. */
  private static checkForWorkType(data: Record<string, any>, workType: string) {
    const frequencies = workType === "school" ? schoolFeeFrequencies : coachingFeeFrequencies;
    if (data.feeFrequency !== undefined && !frequencies.includes(data.feeFrequency)) {
      throw statusError(`Fee frequency must be one of: ${frequencies.join(", ")}`, HttpStatus.BAD_REQUEST);
    }
    if (workType === "school" && data.name !== undefined && !SCHOOL_CLASSES.includes(data.name)) {
      throw statusError(`Class must be one of: ${SCHOOL_CLASSES.join(", ")}`, HttpStatus.BAD_REQUEST);
    }
  }

  private static async ensureUniqueName(adminId: unknown, name: string, exceptId?: unknown) {
    const clash = await Course.findOne({ adminId, name: { $regex: `^${escapeRegex(name)}$`, $options: "i" }, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).select("_id").lean();
    if (clash) throw statusError(`“${name}” already exists`, HttpStatus.CONFLICT);
  }

  static async createCourse(input: Record<string, any>, workType: string, adminId: unknown) {
    const data: Record<string, any> = { adminId, workType };
    for (const field of COURSE_FIELDS) if (input[field] !== undefined) data[field] = blankToNull(input[field]);
    this.checkForWorkType(data, workType);
    await this.ensureUniqueName(adminId, data.name);
    const course = await this.insertWithCode(data);
    return this.withEnrolment([course.toObject()]).then(([row]) => row);
  }

  // Retry if the generated course code already exists.
  private static async insertWithCode(data: Record<string, any>) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        return await Course.create({ ...data, courseCode: generateSixDigitId() });
      } catch (error) {
        if (!(error.code === 11000 && error.keyPattern?.courseCode) || attempt === 9) throw error;
      }
    }
    throw new Error("Unable to generate a unique course ID");
  }

  // Accepts the 6-digit course code or the MongoDB _id, limited to the owner's own courses.
  private static async findByIdentifier(identifier: string, scope: StaffScope = {}) {
    const value = String(identifier ?? "").trim();
    if (/^\d{6}$/.test(value)) return Course.findOne({ courseCode: value, ...scope });
    if (!mongoose.Types.ObjectId.isValid(value)) throw statusError("Invalid course ID", HttpStatus.BAD_REQUEST);
    return Course.findOne({ _id: value, ...scope });
  }

  static async getCourseById(identifier: string, scope: StaffScope = {}) {
    const course = await this.findByIdentifier(identifier, scope);
    if (!course) throw statusError("Course not found", HttpStatus.NOT_FOUND);
    return course;
  }

  static async getCourse(identifier: string, scope: StaffScope = {}) {
    const course = await this.getCourseById(identifier, scope);
    return this.withEnrolment([course.toObject()]).then(([row]) => row);
  }

  static async getAllCourses(scope: StaffScope = {}, { status }: { status?: string } = {}) {
    const courses = await Course.find({ ...scope, ...(status ? { status } : {}) }).sort({ createdAt: 1 }).lean();
    return this.withEnrolment(courses);
  }

  /** Adds `enrolled`: the owner's students whose course / class name matches. */
  private static async withEnrolment(courses: Record<string, any>[]) {
    if (!courses.length) return [];
    const byOwner = new Map<string, Record<string, any>[]>();
    courses.forEach(course => byOwner.set(String(course.adminId), [...(byOwner.get(String(course.adminId)) || []), course]));
    const counts = new Map<string, number>();
    for (const [adminId, list] of byOwner) {
      const workType = list[0].workType;
      const field = studentCourseField(workType);
      const students = await StudentDetailsModel.find({ adminId, workType }).select(field).lean();
      const names = students.map(student => String(field.split(".").reduce((value: any, key) => value?.[key], student) ?? ""));
      for (const course of list) {
        const pattern = nameInListRegex(course.name);
        counts.set(String(course._id), names.filter(name => pattern.test(name)).length);
      }
    }
    return courses.map(course => ({ ...course, enrolled: counts.get(String(course._id)) ?? 0 }));
  }

  static async updateCourse(identifier: string, input: Record<string, any>, scope: StaffScope = {}) {
    const existing = await this.getCourseById(identifier, scope);
    const update: Record<string, any> = {};
    for (const field of COURSE_FIELDS) if (input[field] !== undefined) update[field] = blankToNull(input[field]);
    this.checkForWorkType(update, existing.workType);
    const renamed = update.name !== undefined && update.name !== existing.name;
    if (renamed) await this.ensureUniqueName(existing.adminId, update.name, existing._id);
    const course = await Course.findByIdAndUpdate(existing._id, { $set: update }, { new: true, runValidators: true }).lean();
    // Students store the course by name, so a rename follows through to them.
    if (renamed) await this.renameOnStudents(existing.adminId, existing.workType, existing.name, update.name);
    return this.withEnrolment([course]).then(([row]) => row);
  }

  private static async renameOnStudents(adminId: unknown, workType: string, from: string, to: string) {
    const field = studentCourseField(workType);
    const pattern = nameInListRegex(from);
    const students = await StudentDetailsModel.find({ adminId, workType, [field]: pattern }).select(field).lean();
    await Promise.all(students.map(student => {
      const current = String(field.split(".").reduce((value: any, key) => value?.[key], student) ?? "");
      const next = current.split(",").map(name => name.trim()).map(name => name.toLowerCase() === from.toLowerCase() ? to : name).join(", ");
      return StudentDetailsModel.updateOne({ _id: student._id }, { $set: { [field]: next } });
    }));
  }

  /** A course with students cannot be deleted; the owner marks it Inactive instead. */
  static async deleteCourse(identifier: string, scope: StaffScope = {}) {
    const existing = await this.getCourseById(identifier, scope);
    const [{ enrolled }] = await this.withEnrolment([existing.toObject()]);
    if (enrolled > 0) {
      const label = existing.workType === "school" ? "class" : "course";
      throw statusError(`${enrolled} student${enrolled === 1 ? " is" : "s are"} in this ${label}. Mark it Inactive instead of deleting it.`, HttpStatus.CONFLICT);
    }
    const batches = await Batch.countDocuments({ courseId: existing._id });
    if (batches > 0) {
      const label = existing.workType === "school" ? "section" : "batch";
      throw statusError(`Delete or move its ${batches} ${label}${batches === 1 ? "" : "s"} first.`, HttpStatus.CONFLICT);
    }
    if (await Test.exists({ courseId: existing._id }) || await Material.exists({ courseId: existing._id })) throw statusError("Tests or study materials use this course. Mark it Inactive instead of deleting it.", HttpStatus.CONFLICT);
    const subjects = await Subject.countDocuments({ courseId: existing._id });
    if (subjects > 0) throw statusError(`Delete its ${subjects} subject${subjects === 1 ? "" : "s"} under Subjects first.`, HttpStatus.CONFLICT);
    const syllabi = await Syllabus.find({ courseId: existing._id }).select("_id").lean();
    await SyllabusProgress.deleteMany({ syllabusId: { $in: syllabi.map(syllabus => syllabus._id) } });
    await Syllabus.deleteMany({ courseId: existing._id });
    await Course.deleteOne({ _id: existing._id });
    return { message: "Course deleted successfully", course: existing };
  }
}
