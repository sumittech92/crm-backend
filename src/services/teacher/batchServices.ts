import HttpStatus from "http-status-codes";
import mongoose from "mongoose";
import Batch from "../../model/teacher/batchModel.js";
import Course from "../../model/teacher/courseModel.js";
import Teacher from "../../model/teacher/teacherInfo.js";
import StudentDetailsModel from "../../model/students/studentInfo.js";
import Test from "../../model/test/test.js";
import Material from "../../model/material/material.js";
import Subject from "../../model/subject/subject.js";
import Period from "../../model/timetable/timetable.js";
import Task from "../../model/task/task.js";
import { SyllabusProgress } from "../../model/syllabus/syllabus.js";
import type { StaffScope } from "../../utilis/ownerScope.js";
import { escapeRegex, parseDay } from "../../utilis/ownerScope.js";
import { generateSixDigitId } from "../../utilis/generateId.js";

const statusError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const blankToNull = (value: unknown) => typeof value === "string" && !value.trim() ? null : value;
const nameInListRegex = (name: string) => new RegExp(`(^|,)\\s*${escapeRegex(name)}\\s*(,|$)`, "i");
const listHas = (text: unknown, name: string) => nameInListRegex(name).test(String(text ?? ""));
const minutes = (time: string) => { const [hours, mins] = time.split(":").map(Number); return hours * 60 + mins; };
const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** School sections are "Section A" … "Section Z". */
const SCHOOL_SECTION = /^Section [A-Z]$/;

/** Accepts a 6-digit code or a MongoDB _id. */
const codeOrId = (value: string, codeField: string) => {
  const text = String(value ?? "").trim();
  if (/^\d{6}$/.test(text)) return { [codeField]: text };
  if (mongoose.Types.ObjectId.isValid(text)) return { _id: text };
  return null;
};

export class BatchService {

  /** Course / class and teachers must belong to the same institute. */
  private static async resolveCourse(courseCode: string, adminId: unknown, workType: string) {
    const match = codeOrId(courseCode, "courseCode");
    const course = match ? await Course.findOne({ ...match, adminId, workType }).lean() : null;
    if (!course) throw statusError(workType === "school" ? "Class not found. Add it under Classes first." : "Course not found. Add it under Courses first.", HttpStatus.BAD_REQUEST);
    return course;
  }

  private static async resolveTeachers(teacherCodes: string[], adminId: unknown) {
    if (!teacherCodes.length) return [];
    const matches = teacherCodes.map(code => codeOrId(code, "teacherCode"));
    if (matches.some(match => !match)) throw statusError("Invalid teacher ID", HttpStatus.BAD_REQUEST);
    const teachers = await Teacher.find({ adminId, $or: matches }).select("_id teacherCode fullName").lean();
    if (teachers.length !== new Set(teacherCodes).size) throw statusError("One or more teachers were not found", HttpStatus.BAD_REQUEST);
    return teachers;
  }

  /** Builds the stored fields and applies the coaching / school rules. `current` is the saved batch when updating. */
  private static async prepare(input: Record<string, any>, workType: string, adminId: unknown, current?: Record<string, any>) {
    const data: Record<string, any> = {};
    if (input.name !== undefined) data.name = String(input.name).trim();
    if (input.courseCode !== undefined) data.courseId = (await this.resolveCourse(input.courseCode, adminId, workType))._id;
    if (input.teacherCodes !== undefined) data.teacherIds = (await this.resolveTeachers(input.teacherCodes, adminId)).map(teacher => teacher._id);
    for (const field of ["room", "capacity", "status"]) if (input[field] !== undefined) data[field] = blankToNull(input[field]);
    const merged = { ...current, ...data };

    if (workType === "school") {
      if (!SCHOOL_SECTION.test(merged.name)) throw statusError("Section must be like “Section A”", HttpStatus.BAD_REQUEST);
      if ((merged.teacherIds || []).length > 1) throw statusError("A section has one class teacher", HttpStatus.BAD_REQUEST);
      Object.assign(data, { days: [], startTime: null, endTime: null, startDate: null, endDate: null });
      return data;
    }

    if (input.days !== undefined) data.days = [...input.days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
    for (const field of ["startTime", "endTime"]) if (input[field] !== undefined) data[field] = blankToNull(input[field]);
    for (const field of ["startDate", "endDate"]) if (input[field] !== undefined) data[field] = blankToNull(input[field]) ? parseDay(input[field], field === "startDate" ? "start date" : "end date") : null;
    const next = { ...current, ...data };
    if (!next.days?.length) throw statusError("Choose at least one day", HttpStatus.BAD_REQUEST);
    if (!next.startTime || !next.endTime) throw statusError("Start time and end time are required", HttpStatus.BAD_REQUEST);
    if (minutes(next.endTime) <= minutes(next.startTime)) throw statusError("End time must be after the start time", HttpStatus.BAD_REQUEST);
    if (!next.startDate) throw statusError("Start date is required", HttpStatus.BAD_REQUEST);
    if (next.endDate && new Date(next.endDate) < new Date(next.startDate)) throw statusError("End date must be on or after the start date", HttpStatus.BAD_REQUEST);
    return data;
  }

  /** Names are unique per institute (coaching) or per class (school). */
  private static async ensureUniqueName(batch: Record<string, any>, exceptId?: unknown) {
    const filter: Record<string, any> = { adminId: batch.adminId, name: { $regex: `^${escapeRegex(batch.name)}$`, $options: "i" }, ...(exceptId ? { _id: { $ne: exceptId } } : {}) };
    if (batch.workType === "school") filter.courseId = batch.courseId;
    if (await Batch.exists(filter)) throw statusError(batch.workType === "school" ? `${batch.name} already exists in this class` : `A batch named “${batch.name}” already exists`, HttpStatus.CONFLICT);
  }

  /**
   * Active batches may not share a teacher or a room at overlapping times on the same day (coaching),
   * and a teacher is class teacher of only one active section (school).
   */
  private static async ensureNoClash(batch: Record<string, any>, exceptId?: unknown) {
    if (batch.status === "inactive") return;
    const others = await Batch.find({ adminId: batch.adminId, status: "active", ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).lean();
    const teacherIds = (batch.teacherIds || []).map(String);
    if (batch.workType === "school") {
      const clash = others.find(other => other.teacherIds.some(id => teacherIds.includes(String(id))));
      if (clash) {
        const course = await Course.findById(clash.courseId).select("name").lean();
        throw statusError(`This teacher is already class teacher of ${course?.name ?? "another class"} · ${clash.name}`, HttpStatus.CONFLICT);
      }
      return;
    }
    const start = minutes(batch.startTime), end = minutes(batch.endTime);
    const from = new Date(batch.startDate).getTime(), to = batch.endDate ? new Date(batch.endDate).getTime() : Infinity;
    const room = String(batch.room || "").trim().toLowerCase();
    for (const other of others) {
      if (!other.startTime || !other.endTime || !other.days.some(day => batch.days.includes(day))) continue;
      if (!(minutes(other.startTime) < end && start < minutes(other.endTime))) continue;
      const otherFrom = other.startDate ? new Date(other.startDate).getTime() : -Infinity;
      const otherTo = other.endDate ? new Date(other.endDate).getTime() : Infinity;
      if (!(otherFrom <= to && from <= otherTo)) continue;
      const sharedTeacher = other.teacherIds.find(id => teacherIds.includes(String(id)));
      if (sharedTeacher) {
        const teacher = await Teacher.findById(sharedTeacher).select("fullName").lean();
        throw statusError(`${teacher?.fullName || "A teacher"} already teaches “${other.name}” at ${other.startTime}–${other.endTime} on a shared day`, HttpStatus.CONFLICT);
      }
      if (room && String(other.room || "").trim().toLowerCase() === room) {
        throw statusError(`${batch.room} is already used by “${other.name}” at ${other.startTime}–${other.endTime} on a shared day`, HttpStatus.CONFLICT);
      }
    }
  }

  static async createBatch(input: Record<string, any>, workType: string, adminId: unknown) {
    const batch = { adminId, workType, status: "active", ...await this.prepare(input, workType, adminId) };
    await this.ensureUniqueName(batch);
    await this.ensureNoClash(batch);
    const created = await this.insertWithCode(batch);
    return (await this.present([created.toObject()]))[0];
  }

  // Retry if the generated batch code already exists.
  private static async insertWithCode(data: Record<string, any>) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        return await Batch.create({ ...data, batchCode: generateSixDigitId() });
      } catch (error) {
        if (!(error.code === 11000 && error.keyPattern?.batchCode) || attempt === 9) throw error;
      }
    }
    throw new Error("Unable to generate a unique batch ID");
  }

  static async getBatchById(identifier: string, scope: StaffScope = {}) {
    const match = codeOrId(identifier, "batchCode");
    if (!match) throw statusError("Invalid batch ID", HttpStatus.BAD_REQUEST);
    const batch = await Batch.findOne({ ...match, ...scope });
    if (!batch) throw statusError("Batch not found", HttpStatus.NOT_FOUND);
    return batch;
  }

  static async getBatch(identifier: string, scope: StaffScope = {}) {
    return (await this.present([(await this.getBatchById(identifier, scope)).toObject()]))[0];
  }

  static async getAllBatches(scope: StaffScope = {}, { status, courseCode }: { status?: string; courseCode?: string } = {}) {
    const filter: Record<string, any> = { ...scope, ...(status ? { status } : {}) };
    if (courseCode) {
      const match = codeOrId(courseCode, "courseCode");
      const course = match ? await Course.findOne({ ...match, ...scope }).select("_id").lean() : null;
      if (!course) return [];
      filter.courseId = course._id;
    }
    return this.present(await Batch.find(filter).sort({ createdAt: 1 }).lean());
  }

  /** Adds course, teacher names and the number of students in each batch / section. */
  private static async present(batches: Record<string, any>[]) {
    if (!batches.length) return [];
    const courses = await Course.find({ _id: { $in: [...new Set(batches.map(batch => String(batch.courseId)))] } }).select("courseCode name").lean();
    const teachers = await Teacher.find({ _id: { $in: batches.flatMap(batch => batch.teacherIds) } }).select("teacherCode fullName").lean();
    const courseById = new Map(courses.map(course => [String(course._id), course]));
    const teacherById = new Map(teachers.map(teacher => [String(teacher._id), teacher]));
    const students = await StudentDetailsModel.find({ adminId: batches[0].adminId, workType: batches[0].workType }).select("coachingInfo.batchTiming schoolInfo.className schoolInfo.section").lean();
    return batches.map(batch => {
      const course = courseById.get(String(batch.courseId));
      const count = students.filter(student => this.studentInBatch(student, batch, course?.name)).length;
      return {
        ...batch,
        course: course ? { courseCode: course.courseCode, name: course.name } : null,
        teachers: batch.teacherIds.map(id => teacherById.get(String(id))).filter(Boolean).map(teacher => ({ teacherCode: teacher.teacherCode, fullName: teacher.fullName })),
        students: count,
      };
    });
  }

  /** Coaching students list their batches by name; school students list their class and section ("A" or "Section A"). */
  static studentInBatch(student: Record<string, any>, batch: Record<string, any>, courseName?: string) {
    if (batch.workType !== "school") return listHas(student.coachingInfo?.batchTiming, batch.name);
    const letter = batch.name.replace(/^Section\s+/i, "");
    const section = String(student.schoolInfo?.section ?? "");
    return !!courseName && listHas(student.schoolInfo?.className, courseName) && (listHas(section, batch.name) || listHas(section, letter));
  }

  private static async studentCount(batch: Record<string, any>) {
    return (await this.present([batch]))[0].students as number;
  }

  static async updateBatch(identifier: string, input: Record<string, any>, scope: StaffScope = {}) {
    const existing = (await this.getBatchById(identifier, scope)).toObject();
    const update = await this.prepare(input, existing.workType, existing.adminId, existing);
    const next = { ...existing, ...update };
    const renamed = next.name !== existing.name;
    const moved = String(next.courseId) !== String(existing.courseId);
    if (existing.workType === "school" && moved && await this.studentCount(existing) > 0) {
      throw statusError("Students are in this section, so it cannot move to another class", HttpStatus.CONFLICT);
    }
    if (existing.workType === "school" && moved && await Period.exists({ batchId: existing._id })) {
      throw statusError("This section has periods on the timetable, so it cannot move to another class. Remove them first.", HttpStatus.CONFLICT);
    }
    if (renamed || moved) await this.ensureUniqueName(next, existing._id);
    await this.ensureNoClash(next, existing._id);
    if (renamed) await this.renameOnStudents(existing, next.name);
    const saved = await Batch.findByIdAndUpdate(existing._id, { $set: update }, { new: true, runValidators: true }).lean();
    // Subject teachers were set for the section in its old class.
    if (moved) await Subject.updateMany({ "sections.batchId": existing._id }, { $pull: { sections: { batchId: existing._id } } });
    return (await this.present([saved]))[0];
  }

  /** Students store their batch / section by name, so a rename follows through to them. */
  private static async renameOnStudents(batch: Record<string, any>, to: string) {
    const school = batch.workType === "school";
    const field = school ? "schoolInfo.section" : "coachingInfo.batchTiming";
    const course = school ? await Course.findById(batch.courseId).select("name").lean() : null;
    const students = await StudentDetailsModel.find({ adminId: batch.adminId, workType: batch.workType }).select(`${field} schoolInfo.className coachingInfo.batchTiming schoolInfo.section`).lean();
    const fromLetter = batch.name.replace(/^Section\s+/i, "").toLowerCase();
    await Promise.all(students.filter(student => this.studentInBatch(student, batch, course?.name)).map(student => {
      const current = String((school ? student.schoolInfo?.section : student.coachingInfo?.batchTiming) ?? "");
      const next = current.split(",").map(name => name.trim()).map(name => {
        const lower = name.toLowerCase();
        if (lower === batch.name.toLowerCase()) return to;
        return school && lower === fromLetter ? to.replace(/^Section\s+/i, "") : name;
      }).join(", ");
      return StudentDetailsModel.updateOne({ _id: student._id }, { $set: { [field]: next } });
    }));
  }

  /** A batch / section with students cannot be deleted; the owner marks it Inactive instead. */
  static async deleteBatch(identifier: string, scope: StaffScope = {}) {
    const existing = (await this.getBatchById(identifier, scope)).toObject();
    const count = await this.studentCount(existing);
    if (count > 0) {
      const label = existing.workType === "school" ? "section" : "batch";
      throw statusError(`${count} student${count === 1 ? " is" : "s are"} in this ${label}. Mark it Inactive instead of deleting it.`, HttpStatus.CONFLICT);
    }
    const tests = await Test.countDocuments({ batchIds: existing._id }) + await Material.countDocuments({ batchIds: existing._id });
    if (tests > 0) throw statusError(`${tests} test${tests === 1 ? " or material uses" : "s / materials use"} this ${existing.workType === "school" ? "section" : "batch"}. Mark it Inactive instead of deleting it.`, HttpStatus.CONFLICT);
    const label = existing.workType === "school" ? "section" : "batch";
    const periods = await Period.countDocuments({ batchId: existing._id });
    if (periods > 0) throw statusError(`${periods} timetable period${periods === 1 ? " uses" : "s use"} this ${label}. Remove ${periods === 1 ? "it" : "them"} first, or mark the ${label} Inactive.`, HttpStatus.CONFLICT);
    if (await Task.exists({ batchId: existing._id })) throw statusError(`Homework or assignments were given to this ${label}. Mark it Inactive instead of deleting it.`, HttpStatus.CONFLICT);
    await Batch.deleteOne({ _id: existing._id });
    await SyllabusProgress.deleteMany({ batchId: existing._id });
    await Subject.updateMany({ "sections.batchId": existing._id }, { $pull: { sections: { batchId: existing._id } } });
    return { message: "Batch deleted successfully", batch: existing };
  }
}
