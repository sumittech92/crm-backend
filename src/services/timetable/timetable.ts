import HttpStatus from "http-status-codes";
import Period from "../../model/timetable/timetable.js";
import Subject from "../../model/subject/subject.js";
import Batch from "../../model/teacher/batchModel.js";
import Course from "../../model/teacher/courseModel.js";
import Teacher from "../../model/teacher/teacherInfo.js";
import { BatchService } from "../teacher/batchServices.js";
import type { StaffScope } from "../../utilis/ownerScope.js";
import { todayKey } from "../../utilis/ownerScope.js";
import { StaffActor, actorScope } from "../../utilis/staffAccess.js";
import { DAY_ORDER, blankToNull, codeOrId, findScoped, insertWithCode, minutes, statusError, todayName } from "../../utilis/records.js";

/** A period (saved or about to be saved) with the teacher it resolves to. */
export type Slot = { batchId: unknown; subjectId: unknown; day: string; startTime: string; endTime: string; room: string | null; teacherId: unknown };

const same = (a: unknown, b: unknown) => !!a && !!b && String(a) === String(b);
const overlaps = (a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) =>
  minutes(a.startTime) < minutes(b.endTime) && minutes(b.startTime) < minutes(a.endTime);
const roomKey = (room: unknown) => String(room ?? "").trim().toLowerCase();

export class TimetableService {

  /** The teacher a subject assigns to a section, or null. */
  static teacherOf(subject: Record<string, any> | undefined, batchId: unknown): unknown {
    return subject?.sections?.find(section => same(section.batchId, batchId))?.teacherId ?? null;
  }

  private static async resolve(model, codeField: string, identifier: unknown, adminId: unknown, label: string) {
    const match = codeOrId(identifier, codeField);
    const record = match ? await model.findOne({ ...match, adminId }).lean() : null;
    if (!record) throw statusError(`${label} not found`, HttpStatus.BAD_REQUEST);
    return record;
  }

  /** Builds stored fields and checks the subject belongs to the section's class. */
  private static async prepare(input: Record<string, any>, adminId: unknown, current?: Record<string, any>) {
    const data: Record<string, any> = {};
    for (const field of ["day", "startTime", "endTime", "room"]) if (input[field] !== undefined) data[field] = blankToNull(input[field]);
    if (input.batchCode !== undefined) {
      const batch = await this.resolve(Batch, "batchCode", input.batchCode, adminId, "Section");
      if (batch.workType !== "school") throw statusError("The timetable is for school sections; coaching batches keep their own timing", HttpStatus.BAD_REQUEST);
      data.batchId = batch._id;
    }
    if (input.subjectCode !== undefined) data.subjectId = (await this.resolve(Subject, "subjectCode", input.subjectCode, adminId, "Subject"))._id;
    const next = { ...current, ...data };
    if (minutes(next.endTime) <= minutes(next.startTime)) throw statusError("End time must be after the start time", HttpStatus.BAD_REQUEST);
    const [batch, subject] = await Promise.all([Batch.findById(next.batchId).lean(), Subject.findById(next.subjectId).lean()]);
    if (!batch || !subject) throw statusError("Section or subject not found", HttpStatus.BAD_REQUEST);
    if (!same(subject.courseId, batch.courseId)) {
      const course = await Course.findById(batch.courseId).select("name").lean();
      throw statusError(`${subject.name} is not a subject of ${course?.name ?? "this class"}. Add it under Subjects first.`, HttpStatus.BAD_REQUEST);
    }
    if (subject.status === "inactive" && (!current || !same(current.subjectId, subject._id))) throw statusError(`${subject.name} is inactive. Mark it Active under Subjects first.`, HttpStatus.BAD_REQUEST);
    return { data, next, batch, subject };
  }

  /**
   * First clash of the candidate slots with the rest of the timetable: the same section, the same teacher or the same room
   * at an overlapping time on the same day. `excludeIds` are periods being replaced. Returns the message, or null.
   */
  static async findClash(adminId: unknown, slots: Slot[], excludeIds: unknown[] = []): Promise<string | null> {
    if (!slots.length) return null;
    const others = await Period.find({ adminId, day: { $in: [...new Set(slots.map(slot => slot.day))] }, _id: { $nin: excludeIds } }).lean();
    const relevant = others.filter(other => slots.some(slot => slot.day === other.day && overlaps(slot, other)));
    if (!relevant.length) return null;
    const subjects = new Map((await Subject.find({ _id: { $in: relevant.map(other => other.subjectId) } }).lean()).map(subject => [String(subject._id), subject]));
    const batches = new Map((await Batch.find({ _id: { $in: [...relevant.map(other => other.batchId), ...slots.map(slot => slot.batchId)] } }).lean()).map(batch => [String(batch._id), batch]));
    const courses = new Map((await Course.find({ _id: { $in: [...batches.values()].map(batch => batch.courseId) } }).select("name").lean()).map(course => [String(course._id), course.name]));
    const label = (batchId: unknown) => { const batch = batches.get(String(batchId)); return batch ? `${courses.get(String(batch.courseId)) ?? "Class"} · ${batch.name}` : "another section"; };
    for (const slot of slots) {
      for (const other of relevant) {
        if (other.day !== slot.day || !overlaps(slot, other)) continue;
        const otherSubject = subjects.get(String(other.subjectId));
        const when = `${other.startTime}–${other.endTime} on ${other.day}`;
        if (same(other.batchId, slot.batchId)) return `${label(other.batchId)} already has ${otherSubject?.name ?? "a period"} at ${when}`;
        const otherTeacher = this.teacherOf(otherSubject, other.batchId);
        if (same(otherTeacher, slot.teacherId)) {
          const teacher = await Teacher.findById(otherTeacher).select("fullName").lean();
          return `${teacher?.fullName || "This teacher"} already teaches ${label(other.batchId)} (${otherSubject?.name}) at ${when}`;
        }
        const room = roomKey(slot.room || batches.get(String(slot.batchId))?.room);
        if (room && room === roomKey(other.room || batches.get(String(other.batchId))?.room)) return `Room ${slot.room || batches.get(String(slot.batchId))?.room} is already used by ${label(other.batchId)} at ${when}`;
      }
    }
    return null;
  }

  /** A subject with periods per week set cannot get more periods than that in one section. */
  private static async ensureWithinLimit(subject: Record<string, any>, batch: Record<string, any>, exceptId?: unknown) {
    if (!subject.periodsPerWeek) return;
    const count = await Period.countDocuments({ subjectId: subject._id, batchId: batch._id, ...(exceptId ? { _id: { $ne: exceptId } } : {}) });
    if (count >= subject.periodsPerWeek) {
      const course = await Course.findById(batch.courseId).select("name").lean();
      throw statusError(`${subject.name} already has ${count} of ${subject.periodsPerWeek} periods a week in ${course?.name} · ${batch.name}. Raise its periods per week under Subjects first.`, HttpStatus.CONFLICT);
    }
  }

  private static async save(input: Record<string, any>, adminId: unknown, current?: Record<string, any>) {
    const { data, next, batch, subject } = await this.prepare(input, adminId, current);
    const moved = !current || !same(current.subjectId, next.subjectId) || !same(current.batchId, next.batchId);
    if (moved) await this.ensureWithinLimit(subject, batch, current?._id);
    const clash = await this.findClash(adminId, [{ ...next, teacherId: this.teacherOf(subject, batch._id) } as Slot], current ? [current._id] : []);
    if (clash) throw statusError(clash, HttpStatus.CONFLICT);
    return data;
  }

  static async create(input: Record<string, any>, workType: string, adminId: unknown) {
    if (workType !== "school") throw statusError("The timetable is for schools; coaching batches keep their own timing", HttpStatus.FORBIDDEN);
    const data = await this.save(input, adminId);
    const created = await insertWithCode(Period, "periodCode", { room: null, ...data, adminId, workType });
    return (await this.present([created.toObject()]))[0];
  }

  static async update(identifier: string, input: Record<string, any>, scope: StaffScope) {
    const existing = await findScoped(Period, "periodCode", identifier, scope, "period");
    const data = await this.save(input, existing.adminId, existing);
    const saved = await Period.findByIdAndUpdate(existing._id, { $set: data }, { new: true, runValidators: true }).lean();
    return (await this.present([saved]))[0];
  }

  static async remove(identifier: string, scope: StaffScope) {
    const existing = await findScoped(Period, "periodCode", identifier, scope, "period");
    await Period.deleteOne({ _id: existing._id });
    return { message: "Period deleted successfully", period: existing };
  }

  /** ?batchCode= and ?day= narrow the list. Sorted by section, day and time. */
  static async list(scope: StaffScope, { batchCode, day }: { batchCode?: string; day?: string } = {}) {
    const filter: Record<string, any> = { ...scope, ...(day ? { day } : {}) };
    if (batchCode) {
      const match = codeOrId(batchCode, "batchCode");
      const batch = match ? await Batch.findOne({ ...match, ...scope }).select("_id").lean() : null;
      if (!batch) return [];
      filter.batchId = batch._id;
    }
    return this.present(await Period.find(filter).lean());
  }

  /** Adds section, class, subject and the subject's teacher for that section. */
  static async present(periods: Record<string, any>[]) {
    if (!periods.length) return [];
    const batches = new Map((await Batch.find({ _id: { $in: periods.map(period => period.batchId) } }).lean()).map(batch => [String(batch._id), batch]));
    const courses = new Map((await Course.find({ _id: { $in: [...batches.values()].map(batch => batch.courseId) } }).select("courseCode name").lean()).map(course => [String(course._id), course]));
    const subjects = new Map((await Subject.find({ _id: { $in: periods.map(period => period.subjectId) } }).lean()).map(subject => [String(subject._id), subject]));
    const teacherIds = periods.map(period => this.teacherOf(subjects.get(String(period.subjectId)), period.batchId)).filter(Boolean);
    const teachers = new Map((await Teacher.find({ _id: { $in: teacherIds } }).select("teacherCode fullName").lean()).map(teacher => [String(teacher._id), teacher]));
    const rows = periods.map(period => {
      const batch = batches.get(String(period.batchId));
      const course = batch ? courses.get(String(batch.courseId)) : undefined;
      const subject = subjects.get(String(period.subjectId));
      const teacher = teachers.get(String(this.teacherOf(subject, period.batchId)));
      return {
        _id: period._id, periodCode: period.periodCode, day: period.day, startTime: period.startTime, endTime: period.endTime,
        room: period.room, effectiveRoom: period.room || batch?.room || null,
        section: batch ? { batchCode: batch.batchCode, name: batch.name, course: course ? { courseCode: course.courseCode, name: course.name } : null } : null,
        subject: subject ? { subjectCode: subject.subjectCode, name: subject.name, code: subject.code } : null,
        teacher: teacher ? { teacherCode: teacher.teacherCode, fullName: teacher.fullName } : null,
      };
    });
    const sectionKey = (row) => `${row.section?.course?.name ?? ""}|${row.section?.name ?? ""}`;
    return rows.sort((a, b) => sectionKey(a).localeCompare(sectionKey(b), undefined, { numeric: true }) || DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.startTime.localeCompare(b.startTime));
  }

  /**
   * Today's classes. School: today's periods (a teacher sees the ones they teach). Coaching: active batches that meet today
   * (a teacher sees their own batches). Sorted by start time.
   */
  static async today(actor: StaffActor) {
    const teacherId = actor.role === "teacher" ? actor.teacher?._id : null;
    if (actor.role === "teacher" && !teacherId) return [];
    const scope = actorScope(actor);
    const day = todayName();
    const rows: Record<string, any>[] = [];

    if (actor.workType !== "coaching") {
      const raw = await Period.find({ ...scope, day }).lean();
      const subjects = new Map((await Subject.find({ _id: { $in: raw.map(period => period.subjectId) } }).lean()).map(subject => [String(subject._id), subject]));
      const mine = teacherId ? raw.filter(period => same(this.teacherOf(subjects.get(String(period.subjectId)), period.batchId), teacherId)) : raw;
      for (const period of await this.present(mine)) {
        rows.push({
          key: period.periodCode, startTime: period.startTime, endTime: period.endTime,
          group: period.section ? `${period.section.course?.name ?? ""} · ${period.section.name}` : "—",
          batchCode: period.section?.batchCode ?? null, subject: period.subject?.name ?? "—", room: period.effectiveRoom, teacher: period.teacher,
        });
      }
    }

    if (actor.workType !== "school") {
      const today = todayKey();
      const batches = await Batch.find({ ...scope, workType: "coaching", status: "active", days: day, ...(teacherId ? { teacherIds: teacherId } : {}) }).lean();
      const running = batches.filter(batch => batch.startTime && batch.endTime
        && (!batch.startDate || batch.startDate.toISOString().slice(0, 10) <= today) && (!batch.endDate || batch.endDate.toISOString().slice(0, 10) >= today));
      const courses = new Map((await Course.find({ _id: { $in: running.map(batch => batch.courseId) } }).select("name subjects").lean()).map(course => [String(course._id), course]));
      const own = (actor.teacher?.subjects || []).map(subject => subject.toLowerCase());
      for (const batch of running) {
        const course = courses.get(String(batch.courseId));
        const subjects = (course?.subjects || []).filter(subject => !own.length || own.includes(subject.toLowerCase()));
        rows.push({
          key: batch.batchCode, startTime: batch.startTime, endTime: batch.endTime, group: batch.name, batchCode: batch.batchCode,
          subject: subjects.join(", ") || course?.name || "—", room: batch.room, teacher: null,
        });
      }
    }
    return rows.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  /**
   * The signed-in teacher's classes. School: sections where they teach a subject or are class teacher, with their subjects,
   * periods per week and periods scheduled. Coaching: batches they teach.
   */
  static async myClasses(actor: StaffActor) {
    const teacherId = actor.teacher?._id;
    if (actor.role !== "teacher" || !teacherId) return [];
    const batches = await BatchService.getAllBatches(actorScope(actor));
    const own = (actor.teacher?.subjects || []).map(subject => subject.toLowerCase());

    if (actor.workType !== "school") {
      const courses = new Map((await Course.find({ _id: { $in: batches.map(batch => batch.courseId) } }).select("subjects").lean()).map(course => [String(course._id), course.subjects]));
      return batches.filter(batch => batch.teacherIds.some(id => same(id, teacherId))).map(batch => ({
        batchCode: batch.batchCode, group: batch.name, course: batch.course,
        subjects: (courses.get(String(batch.courseId)) || []).filter(subject => !own.length || own.includes(subject.toLowerCase())),
        classTeacher: false, days: batch.days, startTime: batch.startTime, endTime: batch.endTime,
        periodsPerWeek: null, scheduled: null, students: batch.students, capacity: batch.capacity, room: batch.room, status: batch.status,
      }));
    }

    const subjects = await Subject.find({ adminId: actor.adminId, status: "active", "sections.teacherId": teacherId }).lean();
    const counts = await Period.aggregate([{ $match: { subjectId: { $in: subjects.map(subject => subject._id) } } }, { $group: { _id: { subjectId: "$subjectId", batchId: "$batchId" }, count: { $sum: 1 } } }]);
    const scheduled = (subjectId: unknown, batchId: unknown) => counts.find(count => same(count._id.subjectId, subjectId) && same(count._id.batchId, batchId))?.count ?? 0;
    return batches.flatMap(batch => {
      const mine = subjects.filter(subject => subject.sections.some(section => same(section.batchId, batch._id) && same(section.teacherId, teacherId)));
      const classTeacher = batch.teacherIds.some(id => same(id, teacherId));
      if (!mine.length && !classTeacher) return [];
      return [{
        batchCode: batch.batchCode, group: `${batch.course?.name ?? ""} · ${batch.name}`, course: batch.course,
        subjects: mine.map(subject => subject.name), classTeacher, days: [], startTime: null, endTime: null,
        periodsPerWeek: mine.reduce((sum, subject) => sum + (subject.periodsPerWeek || 0), 0) || null,
        scheduled: mine.reduce((sum, subject) => sum + scheduled(subject._id, batch._id), 0),
        students: batch.students, capacity: batch.capacity, room: batch.room, status: batch.status,
      }];
    });
  }
}
