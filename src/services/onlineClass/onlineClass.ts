import HttpStatus from "http-status-codes";
import { randomUUID } from "crypto";
import OnlineClass from "../../model/onlineClass/onlineClass.js";
import Batch from "../../model/teacher/batchModel.js";
import Course from "../../model/teacher/courseModel.js";
import Teacher from "../../model/teacher/teacherInfo.js";
import type { StaffScope } from "../../utilis/ownerScope.js";
import { parseDay, todayKey } from "../../utilis/ownerScope.js";
import { DAY_ORDER, blankToNull, findScoped, insertWithCode, minutes, statusError } from "../../utilis/records.js";
import { PortalService } from "../portal/portal.js";

export type ClassStatus = "scheduled" | "live" | "completed" | "cancelled";
export type ClassActor = { role: "admin" | "teacher"; teacher: Record<string, any> | null };

/** Students may join from this many minutes before the start. */
const JOIN_EARLY_MINUTES = 10;

const dayKey = (date: Date | string) => new Date(date).toISOString().slice(0, 10);
const nowMinutes = () => { const now = new Date(); return now.getHours() * 60 + now.getMinutes(); };

export class OnlineClassService {

  static statusOf(item: Record<string, any>): ClassStatus {
    if (item.cancelled) return "cancelled";
    if (item.completedAt) return "completed";
    const day = dayKey(item.date), today = todayKey();
    if (day < today || (day === today && nowMinutes() >= minutes(item.endTime))) return "completed";
    if (item.startedAt || (day === today && nowMinutes() >= minutes(item.startTime))) return "live";
    return "scheduled";
  }

  /** Students can join from 10 minutes before the start until the end, on the day. */
  static joinable(item: Record<string, any>) {
    const status = this.statusOf(item);
    if (status === "live") return true;
    return status === "scheduled" && dayKey(item.date) === todayKey() && nowMinutes() >= minutes(item.startTime) - JOIN_EARLY_MINUTES;
  }

  private static async batchMap(adminId: unknown) {
    const [batches, courses] = await Promise.all([
      Batch.find({ adminId }).select("batchCode name courseId teacherIds").lean(),
      Course.find({ adminId }).select("name").lean(),
    ]);
    const courseName = new Map(courses.map(course => [String(course._id), course.name]));
    return new Map(batches.map(batch => [String(batch._id), { ...batch, courseName: courseName.get(String(batch.courseId)) || null }]));
  }

  private static view(item: Record<string, any>, batches: Map<string, Record<string, any>>, { forStudent }: { forStudent?: unknown } = {}) {
    const groups = (item.batchIds || []).map(id => batches.get(String(id))).filter(Boolean)
      .map(batch => ({ batchCode: batch!.batchCode, name: batch!.name, courseName: batch!.courseName }));
    const { joins, ...rest } = item;
    const base = { ...rest, batches: groups, status: this.statusOf(item), joinable: this.joinable(item) };
    if (forStudent !== undefined) {
      const status = base.status;
      // Students see the Meet link for classes still to happen (Join also marks them present), and the recording once it is over.
      return { ...base, meetLink: status === "scheduled" || status === "live" ? item.meetLink : null, recordingLink: status === "completed" ? item.recordingLink : null, joined: (joins || []).some(join => String(join.student) === String(forStudent)) };
    }
    return { ...base, joinCount: (joins || []).length };
  }

  // ---------------------------------------------------------------- Staff

  /** Owner: every class. Teacher: classes they take. From 60 days back, upcoming first. */
  static async list(scope: StaffScope, actor: ClassActor) {
    const since = new Date(); since.setDate(since.getDate() - 60);
    const filter: Record<string, any> = { ...scope, date: { $gte: parseDay(dayKey(since)) } };
    if (actor.role === "teacher") filter.teacher = actor.teacher?._id ?? null;
    const [items, batches] = await Promise.all([OnlineClass.find(filter).select("-joins.name").sort({ date: 1, startTime: 1 }).lean(), this.batchMap(scope.adminId)]);
    return items.map(item => this.view(item, batches));
  }

  private static async resolve(input: Record<string, any>, scope: StaffScope, actor: ClassActor, current: Record<string, any> = {}) {
    const data: Record<string, any> = {};
    if (input.batchCodes) {
      const batches = await Batch.find({ ...scope, batchCode: { $in: input.batchCodes } }).select("_id batchCode").lean();
      if (batches.length !== new Set(input.batchCodes).size) throw statusError("Some sections / batches were not found", HttpStatus.NOT_FOUND);
      data.batchIds = batches.map(batch => batch._id);
    }
    for (const field of ["subject", "topic", "startTime", "endTime", "meetLink", "cancelled"]) if (input[field] !== undefined) data[field] = input[field];
    for (const field of ["description", "recordingLink"]) if (input[field] !== undefined) data[field] = blankToNull(input[field]);
    if (actor.role === "teacher") {
      if (!actor.teacher) throw statusError("Your teacher profile was not found", HttpStatus.FORBIDDEN);
      if (!current._id) Object.assign(data, { teacher: actor.teacher._id, teacherName: actor.teacher.fullName });
    } else if (input.teacherCode !== undefined) {
      const teacher = blankToNull(input.teacherCode) ? await Teacher.findOne({ ...scope, teacherCode: input.teacherCode }).select("fullName").lean() : null;
      if (blankToNull(input.teacherCode) && !teacher) throw statusError("Teacher not found", HttpStatus.NOT_FOUND);
      Object.assign(data, { teacher: teacher?._id ?? null, teacherName: teacher?.fullName ?? null });
    }
    const start = data.startTime ?? current.startTime, end = data.endTime ?? current.endTime;
    if (start && end && minutes(end) <= minutes(start)) throw statusError("End time must be after the start time", HttpStatus.BAD_REQUEST);
    return data;
  }

  /** A class can't overlap another class of the same section / batch or the same teacher. */
  private static async checkClash(adminId: unknown, item: Record<string, any>, exceptId?: unknown) {
    const others = await OnlineClass.find({ adminId, date: item.date, cancelled: false, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).lean();
    const clash = others.find(other =>
      minutes(other.startTime) < minutes(item.endTime) && minutes(item.startTime) < minutes(other.endTime)
      && (other.batchIds.some(id => item.batchIds.some(mine => String(mine) === String(id))) || (item.teacher && String(other.teacher) === String(item.teacher))));
    if (clash) throw statusError(`Clashes with “${clash.topic}” on ${dayKey(item.date)} (${clash.startTime}–${clash.endTime}). Pick another time.`, HttpStatus.CONFLICT);
  }

  /** Creates one class, or one per chosen weekday for the chosen number of weeks (a series). */
  static async create(input: Record<string, any>, scope: StaffScope, actor: ClassActor) {
    const data = await this.resolve(input, scope, actor);
    const first = parseDay(input.date, "class date");
    if (dayKey(first) < todayKey()) throw statusError("The class date can't be in the past", HttpStatus.BAD_REQUEST);
    const days: string[] = input.repeatDays?.length ? input.repeatDays : [];
    const weeks = days.length ? Number(input.repeatWeeks) || 1 : 1;
    const dates: Date[] = [];
    if (!days.length) dates.push(first);
    else for (let offset = 0; offset < weeks * 7; offset++) {
      const date = new Date(first); date.setUTCDate(first.getUTCDate() + offset);
      if (days.includes(DAY_ORDER[(date.getUTCDay() + 6) % 7])) dates.push(date);
    }
    if (!dates.length) throw statusError("None of the repeat days fall in that period", HttpStatus.BAD_REQUEST);
    const seriesId = dates.length > 1 ? randomUUID() : null;
    for (const date of dates) await this.checkClash(scope.adminId, { ...data, date });
    const created = [];
    for (const date of dates) created.push((await insertWithCode(OnlineClass, "classCode", { ...data, date, seriesId, adminId: scope.adminId, workType: scope.workType })).toObject());
    const batches = await this.batchMap(scope.adminId);
    return created.map(item => this.view(item, batches));
  }

  private static async own(identifier: string, scope: StaffScope, actor: ClassActor) {
    const existing = await findScoped(OnlineClass, "classCode", identifier, scope, "online class");
    if (actor.role === "teacher" && String(existing.teacher) !== String(actor.teacher?._id)) throw statusError("You can only change your own classes", HttpStatus.FORBIDDEN);
    return existing;
  }

  static async update(identifier: string, input: Record<string, any>, scope: StaffScope, actor: ClassActor) {
    const existing = await this.own(identifier, scope, actor);
    const data = await this.resolve(input, scope, actor, existing);
    if (input.date !== undefined) {
      data.date = parseDay(input.date, "class date");
      if (dayKey(data.date) < todayKey() && dayKey(data.date) !== dayKey(existing.date)) throw statusError("The class date can't be in the past", HttpStatus.BAD_REQUEST);
    }
    const next = { ...existing, ...data };
    if (!next.cancelled) await this.checkClash(scope.adminId, next, existing._id);
    const saved = await OnlineClass.findByIdAndUpdate(existing._id, { $set: data }, { new: true, runValidators: true }).lean();
    return this.view(saved!, await this.batchMap(scope.adminId));
  }

  /** Deletes one class, or with series=true this class and the later classes of its series. */
  static async remove(identifier: string, scope: StaffScope, actor: ClassActor, series = false) {
    const existing = await this.own(identifier, scope, actor);
    const filter = series && existing.seriesId ? { adminId: scope.adminId, seriesId: existing.seriesId, date: { $gte: existing.date } } : { _id: existing._id };
    const result = await OnlineClass.deleteMany(filter);
    return { deleted: result.deletedCount };
  }

  static async start(identifier: string, scope: StaffScope, actor: ClassActor) {
    const existing = await this.own(identifier, scope, actor);
    if (existing.cancelled) throw statusError("This class is cancelled", HttpStatus.BAD_REQUEST);
    if (dayKey(existing.date) !== todayKey()) throw statusError("A class can only be started on its day", HttpStatus.BAD_REQUEST);
    const saved = await OnlineClass.findByIdAndUpdate(existing._id, { $set: { startedAt: existing.startedAt ?? new Date(), completedAt: null } }, { new: true }).lean();
    return this.view(saved!, await this.batchMap(scope.adminId));
  }

  static async complete(identifier: string, recordingLink: unknown, scope: StaffScope, actor: ClassActor) {
    const existing = await this.own(identifier, scope, actor);
    const saved = await OnlineClass.findByIdAndUpdate(existing._id, { $set: { completedAt: existing.completedAt ?? new Date(), recordingLink: blankToNull(recordingLink) ?? existing.recordingLink ?? null } }, { new: true }).lean();
    return this.view(saved!, await this.batchMap(scope.adminId));
  }

  /** Who clicked Join, in order. */
  static async attendance(identifier: string, scope: StaffScope, actor: ClassActor) {
    const existing = await this.own(identifier, scope, actor);
    return (existing.joins || []).map(join => ({ name: join.name, joinedAt: join.joinedAt })).sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
  }

  // ---------------------------------------------------------------- Student / parent portal

  /** Classes of the student's sections / batches, from 30 days back. */
  static async forStudent(student: Record<string, any>) {
    const { batches } = await PortalService.groups(student);
    if (!batches.length) return [];
    const since = new Date(); since.setDate(since.getDate() - 30);
    const items = await OnlineClass.find({ adminId: student.adminId, batchIds: { $in: batches.map(batch => batch._id) }, date: { $gte: parseDay(dayKey(since)) } }).sort({ date: 1, startTime: 1 }).lean();
    const map = await this.batchMap(student.adminId);
    return items.map(item => this.view(item, map, { forStudent: student._id }));
  }

  /** Records that the student joined and returns the Meet link (only while the class can be joined). */
  static async join(student: Record<string, any>, classCode: string) {
    const { batches } = await PortalService.groups(student);
    const item = await OnlineClass.findOne({ adminId: student.adminId, classCode: String(classCode), batchIds: { $in: batches.map(batch => batch._id) } }).lean();
    if (!item) throw statusError("Class not found", HttpStatus.NOT_FOUND);
    const status = this.statusOf(item);
    if (status === "cancelled") throw statusError("This class was cancelled", HttpStatus.BAD_REQUEST);
    if (status === "completed") throw statusError(item.recordingLink ? "This class is over. Watch the recording instead." : "This class is over.", HttpStatus.BAD_REQUEST);
    if (!this.joinable(item)) throw statusError(`You can join from ${JOIN_EARLY_MINUTES} minutes before the class starts (${item.startTime}).`, HttpStatus.BAD_REQUEST);
    if (!(item.joins || []).some(join => String(join.student) === String(student._id))) {
      await OnlineClass.updateOne({ _id: item._id, "joins.student": { $ne: student._id } }, { $push: { joins: { student: student._id, name: student.fullName || "Student", joinedAt: new Date() } } });
    }
    return { meetLink: item.meetLink, topic: item.topic };
  }
}
