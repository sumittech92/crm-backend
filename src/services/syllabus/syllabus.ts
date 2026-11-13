import HttpStatus from "http-status-codes";
import mongoose from "mongoose";
import Syllabus, { SyllabusProgress } from "../../model/syllabus/syllabus.js";
import Course from "../../model/teacher/courseModel.js";
import Batch from "../../model/teacher/batchModel.js";
import Subject from "../../model/subject/subject.js";
import { BatchService } from "../teacher/batchServices.js";
import { SCHOOL_CLASSES } from "../teacher/courseServices.js";
import { parseDay, todayKey } from "../../utilis/ownerScope.js";
import { StaffActor, actorScope, isOwnerLike } from "../../utilis/staffAccess.js";
import { codeOrId, findScoped, insertWithCode, sameName, statusError } from "../../utilis/records.js";

const same = (a: unknown, b: unknown) => !!a && !!b && String(a) === String(b);
const lower = (text: string) => String(text || "").trim().toLowerCase();
const currentMonth = () => todayKey().slice(0, 7);

/** One section / batch a teacher teaches a subject in. */
type Teaching = { courseId: string; subject: string; batchId: string };
export type ProgressStatus = "On track" | "Behind" | "No targets" | "Not set";

/** % done (weighted), % expected by now (chapters whose target month has passed) and On track / Behind. */
export const progressOf = (chapters: Record<string, any>[], doneIds: Set<string>) => {
  const total = chapters.reduce((sum, chapter) => sum + (chapter.weight || 1), 0);
  if (!total) return { percent: 0, expected: null as number | null, status: "Not set" as ProgressStatus, done: 0, total: 0 };
  const doneWeight = chapters.filter(chapter => doneIds.has(String(chapter._id))).reduce((sum, chapter) => sum + (chapter.weight || 1), 0);
  const percent = Math.round((doneWeight / total) * 100);
  const targeted = chapters.some(chapter => chapter.targetMonth);
  const month = currentMonth();
  const expectedWeight = chapters.filter(chapter => chapter.targetMonth && chapter.targetMonth < month).reduce((sum, chapter) => sum + (chapter.weight || 1), 0);
  const expected = targeted ? Math.round((expectedWeight / total) * 100) : null;
  const status: ProgressStatus = expected === null ? "No targets" : percent >= expected ? "On track" : "Behind";
  return { percent, expected, status, done: chapters.filter(chapter => doneIds.has(String(chapter._id))).length, total: chapters.length };
};

export class SyllabusService {

  /** Sections (school, subject teacher under Subjects) / batches (coaching, batch teacher) and the subjects a teacher teaches there. */
  static async teaching(actor: StaffActor): Promise<Teaching[]> {
    const teacherId = actor.teacher?._id;
    if (actor.role !== "teacher" || !teacherId) return [];
    if (actor.workType === "school") {
      const subjects = await Subject.find({ adminId: actor.adminId, "sections.teacherId": teacherId }).select("courseId name sections").lean();
      return subjects.flatMap(subject => subject.sections.filter(section => same(section.teacherId, teacherId)).map(section => ({ courseId: String(subject.courseId), subject: subject.name, batchId: String(section.batchId) })));
    }
    const batches = await Batch.find({ adminId: actor.adminId, teacherIds: teacherId }).select("courseId").lean();
    const courses = new Map((await Course.find({ _id: { $in: batches.map(batch => batch.courseId) } }).select("subjects").lean()).map(course => [String(course._id), course.subjects]));
    const own = (actor.teacher?.subjects || []).map(lower);
    return batches.flatMap(batch => {
      const subjects = courses.get(String(batch.courseId)) || [];
      const mine = subjects.filter(subject => own.includes(lower(subject)));
      return (mine.length ? mine : subjects).map(subject => ({ courseId: String(batch.courseId), subject, batchId: String(batch._id) }));
    });
  }

  private static teaches(teaching: Teaching[], courseId: unknown, subject: string, batchId?: unknown) {
    return teaching.some(item => item.courseId === String(courseId) && lower(item.subject) === lower(subject) && (!batchId || item.batchId === String(batchId)));
  }

  private static label(batch: Record<string, any>, courseName?: string) {
    return batch.workType === "school" && courseName ? `${courseName} · ${batch.name}` : batch.name;
  }

  /**
   * Owner / teacher grid: one group per class / course, columns = its subjects, rows = its sections / batches, each cell
   * the % done with On track / Behind. Teachers see only the sections / batches and subjects they teach.
   */
  static async overview(actor: StaffActor) {
    const owner = isOwnerLike(actor);
    const teaching = owner ? [] : await this.teaching(actor);
    if (!owner && !teaching.length) return [];
    const batches = (await Batch.find({ ...actorScope(actor), status: "active" }).lean())
      .filter(batch => owner || teaching.some(item => item.batchId === String(batch._id)));
    const courses = await Course.find({ _id: { $in: batches.map(batch => batch.courseId) } }).select("courseCode name subjects").lean();
    const syllabi = await Syllabus.find({ courseId: { $in: courses.map(course => course._id) } }).lean();
    const progress = await SyllabusProgress.find({ syllabusId: { $in: syllabi.map(syllabus => syllabus._id) } }).select("syllabusId batchId chapterId").lean();
    const order = (name: string) => { const index = SCHOOL_CLASSES.indexOf(name); return index < 0 ? 999 : index; };
    return courses.sort((a, b) => order(a.name) - order(b.name) || a.name.localeCompare(b.name)).map(course => {
      const ownSyllabi = syllabi.filter(syllabus => same(syllabus.courseId, course._id));
      const subjects = [...new Map([...course.subjects, ...ownSyllabi.map(syllabus => syllabus.subject)].map(subject => [lower(subject), subject])).values()]
        .filter(subject => owner || teaching.some(item => item.courseId === String(course._id) && lower(item.subject) === lower(subject)));
      const rows = batches.filter(batch => same(batch.courseId, course._id)).sort((a, b) => a.name.localeCompare(b.name)).map(batch => ({
        batchCode: batch.batchCode, label: this.label(batch, course.name),
        cells: subjects.map(subject => {
          const syllabus = ownSyllabi.find(item => lower(item.subject) === lower(subject));
          const mine = owner || this.teaches(teaching, course._id, subject, batch._id);
          if (!syllabus) return { subject, syllabusCode: null, percent: 0, expected: null, status: "Not set" as ProgressStatus, done: 0, total: 0, canMark: mine };
          const done = new Set(progress.filter(item => same(item.syllabusId, syllabus._id) && same(item.batchId, batch._id)).map(item => String(item.chapterId)));
          return { subject, syllabusCode: syllabus.syllabusCode, ...progressOf(syllabus.chapters, done), canMark: mine };
        }),
      }));
      return { course: { courseCode: course.courseCode, name: course.name }, subjects, rows };
    }).filter(group => group.rows.length && group.subjects.length);
  }

  private static present(syllabus: Record<string, any>, course: Record<string, any> | undefined, actor: StaffActor) {
    const userId = String(actor.userId);
    return {
      syllabusCode: syllabus.syllabusCode, subject: syllabus.subject, course: course ? { courseCode: course.courseCode, name: course.name } : null,
      chapters: syllabus.chapters.map(chapter => ({ chapterId: String(chapter._id), title: chapter.title, targetMonth: chapter.targetMonth, weight: chapter.weight, mine: same(chapter.addedBy, userId) })),
      canEdit: isOwnerLike(actor), updatedAt: syllabus.updatedAt,
    };
  }

  /** Chapter lists: owners see all; teachers the subjects they teach. */
  static async list(actor: StaffActor) {
    const owner = isOwnerLike(actor);
    const teaching = owner ? [] : await this.teaching(actor);
    const syllabi = (await Syllabus.find(actorScope(actor)).lean()).filter(syllabus => owner || this.teaches(teaching, syllabus.courseId, syllabus.subject));
    const courses = new Map((await Course.find({ _id: { $in: syllabi.map(syllabus => syllabus.courseId) } }).select("courseCode name").lean()).map(course => [String(course._id), course]));
    const order = (name?: string) => { const index = SCHOOL_CLASSES.indexOf(name || ""); return index < 0 ? 999 : index; };
    return syllabi.map(syllabus => this.present(syllabus, courses.get(String(syllabus.courseId)), actor))
      .sort((a, b) => order(a.course?.name) - order(b.course?.name) || String(a.course?.name).localeCompare(String(b.course?.name)) || a.subject.localeCompare(b.subject));
  }

  /** One syllabus with each section's / batch's ticked chapters (the chapter checklist). */
  static async get(identifier: string, actor: StaffActor) {
    const syllabus = await findScoped(Syllabus, "syllabusCode", identifier, actorScope(actor), "syllabus");
    const owner = isOwnerLike(actor);
    const teaching = owner ? [] : await this.teaching(actor);
    if (!owner && !this.teaches(teaching, syllabus.courseId, syllabus.subject)) throw statusError("Syllabus not found", HttpStatus.NOT_FOUND);
    const course = await Course.findById(syllabus.courseId).select("courseCode name").lean();
    const batches = (await Batch.find({ adminId: syllabus.adminId, courseId: syllabus.courseId, status: "active" }).lean())
      .filter(batch => owner || this.teaches(teaching, syllabus.courseId, syllabus.subject, batch._id)).sort((a, b) => a.name.localeCompare(b.name));
    const progress = await SyllabusProgress.find({ syllabusId: syllabus._id, batchId: { $in: batches.map(batch => batch._id) } }).lean();
    return {
      ...this.present(syllabus, course, actor),
      batches: batches.map(batch => {
        const mine = progress.filter(item => same(item.batchId, batch._id));
        const done = new Set(mine.map(item => String(item.chapterId)));
        return {
          batchCode: batch.batchCode, label: this.label(batch, course?.name), ...progressOf(syllabus.chapters, done),
          completed: Object.fromEntries(mine.map(item => [String(item.chapterId), item.completedOn])),
        };
      }),
    };
  }

  /** Validates the chapter list a user sends; teachers may only add chapters or change ones they added. */
  private static chapters(input: Record<string, any>[], actor: StaffActor, current: Record<string, any>[] = []) {
    if (input.length > 150) throw statusError("A syllabus can have up to 150 chapters", HttpStatus.BAD_REQUEST);
    const owner = isOwnerLike(actor);
    const byId = new Map(current.map(chapter => [String(chapter._id), chapter]));
    const next = input.map(item => {
      const existing = item.chapterId ? byId.get(String(item.chapterId)) : undefined;
      if (item.chapterId && !existing) throw statusError("A chapter was removed by someone else. Reload and try again.", HttpStatus.CONFLICT);
      const data = { title: String(item.title).trim(), targetMonth: item.targetMonth || null, weight: item.weight || 1 };
      if (existing && !owner && !same(existing.addedBy, actor.userId)
        && (existing.title !== data.title || (existing.targetMonth || null) !== data.targetMonth || (existing.weight || 1) !== data.weight)) {
        throw statusError(`Only the owner can change “${existing.title}”. You can add your own chapters.`, HttpStatus.FORBIDDEN);
      }
      return existing ? { _id: existing._id, addedBy: existing.addedBy ?? null, ...data } : { _id: new mongoose.Types.ObjectId(), addedBy: actor.userId, ...data };
    });
    if (!owner) {
      const kept = new Set(next.map(chapter => String(chapter._id)));
      const removed = current.find(chapter => !kept.has(String(chapter._id)) && !same(chapter.addedBy, actor.userId));
      if (removed) throw statusError(`Only the owner can remove “${removed.title}”.`, HttpStatus.FORBIDDEN);
    }
    return next;
  }

  static async create(input: Record<string, any>, actor: StaffActor) {
    if (!actor.adminId) throw statusError("Only an Owner or teacher can add a syllabus", HttpStatus.FORBIDDEN);
    const match = codeOrId(input.courseCode, "courseCode");
    const course = match ? await Course.findOne({ ...match, adminId: actor.adminId }).lean() : null;
    if (!course) throw statusError(actor.workType === "school" ? "Class not found" : "Course not found", HttpStatus.BAD_REQUEST);
    const subject = course.subjects.find(name => lower(name) === lower(input.subject));
    if (!subject) throw statusError(`Add ${input.subject} to ${course.name} first (${actor.workType === "school" ? "Subjects" : "Courses"} page).`, HttpStatus.BAD_REQUEST);
    if (!isOwnerLike(actor) && !this.teaches(await this.teaching(actor), course._id, subject)) throw statusError(`You don't teach ${subject} in ${course.name}`, HttpStatus.FORBIDDEN);
    if (await Syllabus.exists({ adminId: actor.adminId, courseId: course._id, subject: sameName(subject) })) throw statusError(`${course.name} · ${subject} already has a syllabus. Edit it instead.`, HttpStatus.CONFLICT);
    const created = await insertWithCode(Syllabus, "syllabusCode", { adminId: actor.adminId, workType: actor.workType, courseId: course._id, subject, chapters: this.chapters(input.chapters || [], actor) });
    return this.present(created.toObject(), course, actor);
  }

  static async update(identifier: string, input: Record<string, any>, actor: StaffActor) {
    const syllabus = await findScoped(Syllabus, "syllabusCode", identifier, actorScope(actor), "syllabus");
    if (!isOwnerLike(actor) && !this.teaches(await this.teaching(actor), syllabus.courseId, syllabus.subject)) throw statusError("Syllabus not found", HttpStatus.NOT_FOUND);
    const chapters = this.chapters(input.chapters || [], actor, syllabus.chapters);
    const kept = new Set(chapters.map(chapter => String(chapter._id)));
    const removed = syllabus.chapters.filter(chapter => !kept.has(String(chapter._id))).map(chapter => chapter._id);
    if (removed.length) await SyllabusProgress.deleteMany({ syllabusId: syllabus._id, chapterId: { $in: removed } });
    const saved = await Syllabus.findByIdAndUpdate(syllabus._id, { $set: { chapters } }, { new: true, runValidators: true }).lean();
    return this.present(saved, await Course.findById(saved.courseId).select("courseCode name").lean(), actor);
  }

  static async remove(identifier: string, actor: StaffActor) {
    if (!isOwnerLike(actor)) throw statusError("Only the owner can delete a syllabus", HttpStatus.FORBIDDEN);
    const syllabus = await findScoped(Syllabus, "syllabusCode", identifier, actorScope(actor), "syllabus");
    await SyllabusProgress.deleteMany({ syllabusId: syllabus._id });
    await Syllabus.deleteOne({ _id: syllabus._id });
    return { message: "Syllabus deleted successfully" };
  }

  /** Tick (or untick) a chapter for one section / batch. The owner, or the teacher of that subject there. */
  static async mark(identifier: string, input: { batchCode: string; chapterId: string; done: boolean; completedOn?: string | null }, actor: StaffActor) {
    const syllabus = await findScoped(Syllabus, "syllabusCode", identifier, actorScope(actor), "syllabus");
    const batch = await Batch.findOne({ adminId: syllabus.adminId, batchCode: input.batchCode, courseId: syllabus.courseId }).lean();
    if (!batch) throw statusError("Section / batch not found in this class / course", HttpStatus.BAD_REQUEST);
    if (!isOwnerLike(actor) && !this.teaches(await this.teaching(actor), syllabus.courseId, syllabus.subject, batch._id)) {
      throw statusError(`You don't teach ${syllabus.subject} in ${batch.name}`, HttpStatus.FORBIDDEN);
    }
    const chapter = syllabus.chapters.find(item => String(item._id) === String(input.chapterId));
    if (!chapter) throw statusError("Chapter not found", HttpStatus.NOT_FOUND);
    if (input.done) {
      const completedOn = parseDay(input.completedOn || todayKey(), "completion date");
      if (completedOn.toISOString().slice(0, 10) > todayKey()) throw statusError("Completion date cannot be in the future", HttpStatus.BAD_REQUEST);
      await SyllabusProgress.updateOne({ syllabusId: syllabus._id, batchId: batch._id, chapterId: chapter._id }, { $set: { adminId: syllabus.adminId, completedOn, markedBy: actor.userId } }, { upsert: true });
    } else {
      await SyllabusProgress.deleteOne({ syllabusId: syllabus._id, batchId: batch._id, chapterId: chapter._id });
    }
    const done = new Set((await SyllabusProgress.find({ syllabusId: syllabus._id, batchId: batch._id }).select("chapterId").lean()).map(item => String(item.chapterId)));
    // `ticked` is this chapter's new state; `done` (from progressOf) is how many chapters are done.
    return { batchCode: batch.batchCode, chapterId: String(chapter._id), ticked: input.done, ...progressOf(syllabus.chapters, done) };
  }

  /** Portal: each subject of the student's class / course(s) with its progress in the student's section / batch. */
  static async forStudent(student: Record<string, any>) {
    const batches = await Batch.find({ adminId: student.adminId, workType: student.workType }).lean();
    const courses = new Map((await Course.find({ _id: { $in: batches.map(batch => batch.courseId) } }).select("name").lean()).map(course => [String(course._id), course.name]));
    const mine = batches.filter(batch => BatchService.studentInBatch(student, batch, courses.get(String(batch.courseId))));
    if (!mine.length) return [];
    const syllabi = await Syllabus.find({ adminId: student.adminId, courseId: { $in: mine.map(batch => batch.courseId) } }).lean();
    const progress = await SyllabusProgress.find({ syllabusId: { $in: syllabi.map(syllabus => syllabus._id) }, batchId: { $in: mine.map(batch => batch._id) } }).lean();
    return syllabi.map(syllabus => {
      const batch = mine.find(item => same(item.courseId, syllabus.courseId));
      const rows = progress.filter(item => same(item.syllabusId, syllabus._id) && same(item.batchId, batch?._id));
      const completed = new Map(rows.map(item => [String(item.chapterId), item.completedOn]));
      return {
        subject: syllabus.subject, course: courses.get(String(syllabus.courseId)) ?? null, ...progressOf(syllabus.chapters, new Set(completed.keys())),
        chapters: syllabus.chapters.map(chapter => ({ title: chapter.title, targetMonth: chapter.targetMonth, completedOn: completed.get(String(chapter._id)) ?? null })),
      };
    }).sort((a, b) => a.subject.localeCompare(b.subject));
  }
}
