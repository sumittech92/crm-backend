import HttpStatus from "http-status-codes";
import Subject from "../../model/subject/subject.js";
import Period from "../../model/timetable/timetable.js";
import Syllabus from "../../model/syllabus/syllabus.js";
import Course from "../../model/teacher/courseModel.js";
import Batch from "../../model/teacher/batchModel.js";
import Teacher from "../../model/teacher/teacherInfo.js";
import { SCHOOL_CLASSES } from "../teacher/courseServices.js";
import { BatchService } from "../teacher/batchServices.js";
import { Slot, TimetableService } from "../timetable/timetable.js";
import type { StaffScope } from "../../utilis/ownerScope.js";
import { StaffActor, actorScope } from "../../utilis/staffAccess.js";
import { addNameToList, blankToNull, codeOrId, findScoped, insertWithCode, minutes, sameName, statusError } from "../../utilis/records.js";

const same = (a: unknown, b: unknown) => !!a && !!b && String(a) === String(b);

export class SubjectService {

  /** Builds stored fields: class, then one entry per section with its teacher (sections must belong to the class). */
  private static async prepare(input: Record<string, any>, adminId: unknown, current?: Record<string, any>) {
    const data: Record<string, any> = {};
    if (input.name !== undefined) data.name = String(input.name).trim();
    if (input.code !== undefined) data.code = blankToNull(input.code) ? String(input.code).trim().toUpperCase() : null;
    if (input.periodsPerWeek !== undefined) data.periodsPerWeek = input.periodsPerWeek || null;
    if (input.status !== undefined) data.status = input.status;
    if (input.courseCode !== undefined) {
      const match = codeOrId(input.courseCode, "courseCode");
      const course = match ? await Course.findOne({ ...match, adminId, workType: "school" }).select("_id").lean() : null;
      if (!course) throw statusError("Class not found. Add it under Classes first.", HttpStatus.BAD_REQUEST);
      data.courseId = course._id;
    }
    const courseId = data.courseId ?? current?.courseId;
    const moved = !!current && !same(current.courseId, courseId);

    if (input.sections !== undefined) {
      const entries: { batchCode: string; teacherCode?: string | null }[] = input.sections;
      if (new Set(entries.map(entry => entry.batchCode)).size !== entries.length) throw statusError("Each section can be listed only once", HttpStatus.BAD_REQUEST);
      const batchMatches = entries.map(entry => codeOrId(entry.batchCode, "batchCode"));
      if (batchMatches.some(match => !match)) throw statusError("Invalid section ID", HttpStatus.BAD_REQUEST);
      const batches = batchMatches.length ? await Batch.find({ adminId, $or: batchMatches }).lean() : [];
      const teacherCodes = [...new Set(entries.map(entry => entry.teacherCode).filter(Boolean))] as string[];
      const teacherMatches = teacherCodes.map(code => codeOrId(code, "teacherCode"));
      if (teacherMatches.some(match => !match)) throw statusError("Invalid teacher ID", HttpStatus.BAD_REQUEST);
      const teachers = teacherMatches.length ? await Teacher.find({ adminId, $or: teacherMatches }).select("_id teacherCode").lean() : [];
      if (teachers.length !== teacherCodes.length) throw statusError("One or more teachers were not found", HttpStatus.BAD_REQUEST);
      data.sections = entries.map(entry => {
        const batch = batches.find(item => item.batchCode === entry.batchCode || String(item._id) === entry.batchCode);
        if (!batch) throw statusError("Section not found", HttpStatus.BAD_REQUEST);
        if (!same(batch.courseId, courseId)) throw statusError(`${batch.name} is not a section of this class`, HttpStatus.BAD_REQUEST);
        const teacher = entry.teacherCode ? teachers.find(item => item.teacherCode === entry.teacherCode || String(item._id) === entry.teacherCode) : null;
        return { batchId: batch._id, teacherId: teacher?._id ?? null };
      });
    } else if (moved) {
      data.sections = [];
    }
    return { data, next: { ...current, ...data }, moved };
  }

  private static async ensureUniqueName(subject: Record<string, any>, exceptId?: unknown) {
    if (await Subject.exists({ adminId: subject.adminId, courseId: subject.courseId, name: sameName(subject.name), ...(exceptId ? { _id: { $ne: exceptId } } : {}) })) {
      const course = await Course.findById(subject.courseId).select("name").lean();
      throw statusError(`${subject.name} already exists in ${course?.name ?? "this class"}`, HttpStatus.CONFLICT);
    }
  }

  /**
   * When a subject that is already on the timetable changes: it may not move class, drop below the periods already
   * scheduled, or get a teacher who is busy at one of its periods.
   */
  private static async checkTimetable(existing: Record<string, any>, next: Record<string, any>, moved: boolean) {
    const periods = await Period.find({ subjectId: existing._id }).lean();
    if (!periods.length) return;
    if (moved) throw statusError("This subject has periods on the timetable. Remove them before moving it to another class.", HttpStatus.CONFLICT);
    if (next.periodsPerWeek) {
      const perSection = new Map<string, number>();
      periods.forEach(period => perSection.set(String(period.batchId), (perSection.get(String(period.batchId)) || 0) + 1));
      const most = Math.max(...perSection.values());
      if (most > next.periodsPerWeek) throw statusError(`A section already has ${most} periods of ${existing.name} on the timetable. Remove some before lowering periods per week to ${next.periodsPerWeek}.`, HttpStatus.CONFLICT);
    }
    const slots: Slot[] = [];
    for (const section of next.sections || []) {
      const before = TimetableService.teacherOf(existing, section.batchId);
      if (!section.teacherId || same(before, section.teacherId)) continue;
      periods.filter(period => same(period.batchId, section.batchId)).forEach(period => slots.push({ ...period, teacherId: section.teacherId } as Slot));
    }
    // Against other subjects' periods…
    const clash = await TimetableService.findClash(existing.adminId, slots, periods.map(period => period._id));
    if (clash) throw statusError(clash, HttpStatus.CONFLICT);
    // …and against this subject's own periods in other sections, with their new teachers.
    const withTeachers = periods.map(period => ({ period, teacherId: TimetableService.teacherOf(next, period.batchId) }));
    for (const slot of slots) {
      const other = withTeachers.find(({ period, teacherId }) => !same(period.batchId, slot.batchId) && same(teacherId, slot.teacherId) && period.day === slot.day
        && minutes(period.startTime) < minutes(slot.endTime) && minutes(slot.startTime) < minutes(period.endTime));
      if (other) {
        const [teacher, batch] = await Promise.all([Teacher.findById(slot.teacherId).select("fullName").lean(), Batch.findById(other.period.batchId).select("name").lean()]);
        throw statusError(`${teacher?.fullName || "This teacher"} would have ${existing.name} in ${batch?.name ?? "another section"} at the same time (${other.period.startTime}–${other.period.endTime} on ${other.period.day})`, HttpStatus.CONFLICT);
      }
    }
  }

  /** Keeps the class's subject list and the assigned teachers' subjects in step (exams and marks entry read those). */
  private static async syncNames(subject: Record<string, any>, previous?: Record<string, any>) {
    if (previous && (previous.name !== subject.name || !same(previous.courseId, subject.courseId))) {
      await Course.updateOne({ _id: previous.courseId }, { $pull: { subjects: sameName(previous.name) } });
    }
    await addNameToList(Course, subject.courseId, "subjects", subject.name);
    const teacherIds = [...new Set((subject.sections || []).map(section => section.teacherId).filter(Boolean).map(String))];
    for (const teacherId of teacherIds) await addNameToList(Teacher, teacherId, "schoolInfo.subjects", subject.name);
  }

  static async create(input: Record<string, any>, workType: string, adminId: unknown) {
    if (workType !== "school") throw statusError("Subjects are set up per class in schools. Coaching courses keep their subjects on the course.", HttpStatus.FORBIDDEN);
    const { next } = await this.prepare(input, adminId);
    const subject = { status: "active", sections: [], ...next, adminId, workType };
    await this.ensureUniqueName(subject);
    const created = (await insertWithCode(Subject, "subjectCode", subject)).toObject();
    await this.syncNames(created);
    return (await this.present([created]))[0];
  }

  static async update(identifier: string, input: Record<string, any>, scope: StaffScope) {
    const existing = await findScoped(Subject, "subjectCode", identifier, scope, "subject");
    const { data, next, moved } = await this.prepare(input, existing.adminId, existing);
    if (next.name !== existing.name || moved) await this.ensureUniqueName(next, existing._id);
    await this.checkTimetable(existing, next, moved);
    const saved = await Subject.findByIdAndUpdate(existing._id, { $set: data }, { new: true, runValidators: true }).lean();
    await this.syncNames(saved, existing);
    // The class's syllabus for this subject follows a rename.
    if (saved.name !== existing.name && !moved) await Syllabus.updateMany({ adminId: existing.adminId, courseId: existing.courseId, subject: sameName(existing.name) }, { $set: { subject: saved.name } });
    return (await this.present([saved]))[0];
  }

  /** A subject on the timetable cannot be deleted. Deleting removes it from the class's subject list (teachers keep it on their profile). */
  static async remove(identifier: string, scope: StaffScope) {
    const existing = await findScoped(Subject, "subjectCode", identifier, scope, "subject");
    const periods = await Period.countDocuments({ subjectId: existing._id });
    if (periods > 0) throw statusError(`${periods} timetable period${periods === 1 ? " uses" : "s use"} this subject. Remove ${periods === 1 ? "it" : "them"} first, or mark the subject Inactive.`, HttpStatus.CONFLICT);
    await Subject.deleteOne({ _id: existing._id });
    await Course.updateOne({ _id: existing.courseId }, { $pull: { subjects: sameName(existing.name) } });
    return { message: "Subject deleted successfully", subject: existing };
  }

  /** ?courseCode= narrows to one class. Sorted by class, then subject name. */
  static async list(scope: StaffScope, { courseCode }: { courseCode?: string } = {}) {
    const filter: Record<string, any> = { ...scope };
    if (courseCode) {
      const match = codeOrId(courseCode, "courseCode");
      const course = match ? await Course.findOne({ ...match, ...scope }).select("_id").lean() : null;
      if (!course) return [];
      filter.courseId = course._id;
    }
    return this.present(await Subject.find(filter).lean());
  }

  /** Adds class, section names, teachers and how many periods are on the timetable per section. */
  static async present(subjects: Record<string, any>[]) {
    if (!subjects.length) return [];
    const courses = new Map((await Course.find({ _id: { $in: subjects.map(subject => subject.courseId) } }).select("courseCode name").lean()).map(course => [String(course._id), course]));
    const batches = new Map((await Batch.find({ _id: { $in: subjects.flatMap(subject => subject.sections.map(section => section.batchId)) } }).select("batchCode name").lean()).map(batch => [String(batch._id), batch]));
    const teachers = new Map((await Teacher.find({ _id: { $in: subjects.flatMap(subject => subject.sections.map(section => section.teacherId)).filter(Boolean) } }).select("teacherCode fullName").lean()).map(teacher => [String(teacher._id), teacher]));
    const counts = await Period.aggregate([{ $match: { subjectId: { $in: subjects.map(subject => subject._id) } } }, { $group: { _id: { subjectId: "$subjectId", batchId: "$batchId" }, count: { $sum: 1 } } }]);
    const scheduled = (subjectId: unknown, batchId: unknown) => counts.find(count => same(count._id.subjectId, subjectId) && same(count._id.batchId, batchId))?.count ?? 0;
    const rows = subjects.map(subject => {
      const course = courses.get(String(subject.courseId));
      const sections = subject.sections
        .map(section => ({ section, batch: batches.get(String(section.batchId)) }))
        .filter(({ batch }) => batch)
        .map(({ section, batch }) => {
          const teacher = section.teacherId ? teachers.get(String(section.teacherId)) : null;
          return { batchCode: batch.batchCode, name: batch.name, teacher: teacher ? { teacherCode: teacher.teacherCode, fullName: teacher.fullName } : null, scheduled: scheduled(subject._id, batch._id) };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        _id: subject._id, subjectCode: subject.subjectCode, name: subject.name, code: subject.code, periodsPerWeek: subject.periodsPerWeek, status: subject.status,
        course: course ? { courseCode: course.courseCode, name: course.name } : null, sections,
        scheduled: sections.reduce((sum, section) => sum + section.scheduled, 0),
      };
    });
    const order = (row) => SCHOOL_CLASSES.indexOf(row.course?.name ?? "");
    return rows.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
  }

  /** The signed-in teacher's subjects: one row per subject and section they teach. */
  static async mine(actor: StaffActor) {
    const teacherId = actor.teacher?._id;
    if (actor.role !== "teacher" || !teacherId) return [];
    const me = await Teacher.findById(teacherId).select("teacherCode").lean();
    const subjects = await this.present(await Subject.find({ adminId: actor.adminId, "sections.teacherId": teacherId }).lean());
    const batchesByCode = new Map((await BatchService.getAllBatches(actorScope(actor))).map(batch => [batch.batchCode, batch]));
    return subjects.flatMap(subject => subject.sections
      .filter(section => batchesByCode.has(section.batchCode) && section.teacher?.teacherCode === me?.teacherCode)
      .map(section => {
        const batch = batchesByCode.get(section.batchCode);
        return {
          subjectCode: subject.subjectCode, name: subject.name, code: subject.code, status: subject.status, course: subject.course,
          section: { batchCode: section.batchCode, name: section.name, room: batch.room, students: batch.students },
          periodsPerWeek: subject.periodsPerWeek, scheduled: section.scheduled,
        };
      }));
  }
}
