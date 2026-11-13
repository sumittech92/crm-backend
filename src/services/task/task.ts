import HttpStatus from "http-status-codes";
import Task from "../../model/task/task.js";
import Batch from "../../model/teacher/batchModel.js";
import Course from "../../model/teacher/courseModel.js";
import Subject from "../../model/subject/subject.js";
import AuthModel from "../../model/Auth/auth.js";
import TaskSubmission from "../../model/task/taskSubmission.js";
import StudentDetailsModel from "../../model/students/studentInfo.js";
import { BatchService } from "../teacher/batchServices.js";
import { parseDay, todayKey } from "../../utilis/ownerScope.js";
import { StaffActor, actorScope, isOwnerLike } from "../../utilis/staffAccess.js";
import { isOwnStoredFile, removeStoredFile } from "../../utilis/storedFiles.js";
import { blankToNull, codeOrId, findScoped, insertWithCode, sameName, statusError } from "../../utilis/records.js";

const same = (a: unknown, b: unknown) => !!a && !!b && String(a) === String(b);
const dayKey = (date: Date | string) => new Date(date).toISOString().slice(0, 10);
const unique = (names: string[]) => [...new Map(names.filter(Boolean).map(name => [name.toLowerCase(), name])).values()];

export type TaskOption = { batchCode: string; label: string; subjects: string[] };

export class TaskService {

  private static label(batch: Record<string, any>, courseName?: string) {
    return batch.workType === "school" && courseName ? `${courseName} · ${batch.name}` : batch.name;
  }

  /**
   * Sections (school) or batches (coaching) this user may give work to, with the subjects allowed in each.
   * Owners: every active one. School teachers: sections where they teach a subject (that subject) or are class teacher
   * (every subject of the class). Coaching teachers: their batches.
   */
  static async options(actor: StaffActor): Promise<TaskOption[]> {
    const teacherId = actor.teacher?._id;
    if (!isOwnerLike(actor) && !teacherId) return [];
    const batches = await Batch.find({ ...actorScope(actor), status: "active" }).lean();
    const courses = new Map((await Course.find({ _id: { $in: batches.map(batch => batch.courseId) } }).select("name subjects").lean()).map(course => [String(course._id), course]));
    const own = actor.teacher?.subjects || [];
    const subjects = actor.workType === "school" && teacherId
      ? await Subject.find({ adminId: actor.adminId, status: "active", "sections.teacherId": teacherId }).select("name sections").lean()
      : [];
    const options = batches.map(batch => {
      const course = courses.get(String(batch.courseId));
      const classSubjects: string[] = course?.subjects || [];
      let allowed: string[];
      if (isOwnerLike(actor)) allowed = classSubjects;
      else if (batch.workType === "school") {
        const taught = subjects.filter(subject => subject.sections.some(section => same(section.batchId, batch._id) && same(section.teacherId, teacherId))).map(subject => subject.name);
        allowed = batch.teacherIds.some(id => same(id, teacherId)) ? [...taught, ...classSubjects] : taught;
      } else {
        if (!batch.teacherIds.some(id => same(id, teacherId))) allowed = [];
        else {
          const shared = classSubjects.filter(subject => own.some(name => name.toLowerCase() === subject.toLowerCase()));
          allowed = shared.length ? shared : classSubjects.length ? classSubjects : own;
          if (!allowed.length) allowed = [course?.name || batch.name];
        }
      }
      return { batchCode: batch.batchCode, label: this.label(batch, course?.name), subjects: unique(allowed) };
    });
    return options.filter(option => isOwnerLike(actor) || option.subjects.length).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }

  private static canManage(task: Record<string, any>, actor: StaffActor) {
    return isOwnerLike(actor) || same(task.createdBy, actor.userId);
  }

  /** Builds stored fields and checks the user may give this subject to this section / batch. */
  private static async prepare(input: Record<string, any>, actor: StaffActor, adminId: unknown, current?: Record<string, any>) {
    const data: Record<string, any> = {};
    for (const field of ["title", "subject", "description", "status"]) if (input[field] !== undefined) data[field] = blankToNull(input[field]);
    if (input.dueDate !== undefined) data.dueDate = parseDay(input.dueDate, "due date");
    if (input.attachment !== undefined) {
      if (input.attachment && !isOwnStoredFile(input.attachment.url, "materials", adminId)) throw statusError("Upload the attachment through the file upload first", HttpStatus.BAD_REQUEST);
      data.attachment = input.attachment || null;
    }
    if (input.batchCode !== undefined) {
      const match = codeOrId(input.batchCode, "batchCode");
      const batch = match ? await Batch.findOne({ ...match, adminId }).select("_id").lean() : null;
      if (!batch) throw statusError("Section / batch not found", HttpStatus.BAD_REQUEST);
      data.batchId = batch._id;
    }
    const next = { ...current, ...data };
    if (!current && dayKey(next.dueDate) < todayKey()) throw statusError("Due date cannot be in the past", HttpStatus.BAD_REQUEST);

    if (input.batchCode !== undefined || input.subject !== undefined) {
      const batch = await Batch.findById(next.batchId).lean();
      const option = (await this.options(actor)).find(item => item.batchCode === batch?.batchCode);
      if (!isOwnerLike(actor)) {
        if (!option) throw statusError(`You can only give work to your own ${batch?.workType === "school" ? "sections" : "batches"}`, HttpStatus.FORBIDDEN);
        const match = option.subjects.find(subject => sameName(next.subject).test(subject));
        if (!match) throw statusError(`You do not teach ${next.subject} in ${option.label}`, HttpStatus.FORBIDDEN);
        data.subject = match;
      }
    }
    return data;
  }

  static async create(input: Record<string, any>, actor: StaffActor) {
    if (!actor.adminId) throw statusError("Only an Owner or teacher can give homework and assignments", HttpStatus.FORBIDDEN);
    const data = await this.prepare(input, actor, actor.adminId);
    const created = await insertWithCode(Task, "taskCode", { status: "assigned", description: null, attachment: null, ...data, kind: input.kind, adminId: actor.adminId, workType: actor.workType, createdBy: actor.userId });
    return (await this.present([created.toObject()], actor))[0];
  }

  static async update(identifier: string, input: Record<string, any>, actor: StaffActor) {
    const existing = await findScoped(Task, "taskCode", identifier, actorScope(actor), "homework / assignment");
    if (!this.canManage(existing, actor)) throw statusError("Only the teacher who gave this can change it", HttpStatus.FORBIDDEN);
    const data = await this.prepare(input, actor, existing.adminId, existing);
    const saved = await Task.findByIdAndUpdate(existing._id, { $set: data }, { new: true, runValidators: true }).lean();
    if (data.attachment !== undefined && existing.attachment?.url && existing.attachment.url !== data.attachment?.url) removeStoredFile(existing.attachment.url, "materials");
    return (await this.present([saved], actor))[0];
  }

  static async remove(identifier: string, actor: StaffActor) {
    const existing = await findScoped(Task, "taskCode", identifier, actorScope(actor), "homework / assignment");
    if (!this.canManage(existing, actor)) throw statusError("Only the teacher who gave this can delete it", HttpStatus.FORBIDDEN);
    await Task.deleteOne({ _id: existing._id });
    removeStoredFile(existing.attachment?.url, "materials");
    const submissions = await TaskSubmission.find({ task: existing._id }).select("file").lean();
    submissions.forEach(submission => removeStoredFile(submission.file?.url, "portal"));
    await TaskSubmission.deleteMany({ task: existing._id });
    return { message: "Deleted successfully", task: existing };
  }

  /** Teachers see what they gave; owners see everything. ?kind=homework|assignment. Newest due date first. */
  static async list(actor: StaffActor, { kind }: { kind?: string } = {}) {
    const filter: Record<string, any> = { ...actorScope(actor), ...(kind ? { kind } : {}) };
    if (!isOwnerLike(actor)) filter.createdBy = actor.userId;
    return this.present(await Task.find(filter).sort({ dueDate: -1, createdAt: -1 }).lean(), actor);
  }

  private static async present(tasks: Record<string, any>[], actor: StaffActor) {
    if (!tasks.length) return [];
    const batches = new Map((await Batch.find({ _id: { $in: tasks.map(task => task.batchId) } }).select("batchCode name workType courseId").lean()).map(batch => [String(batch._id), batch]));
    const courses = new Map((await Course.find({ _id: { $in: [...batches.values()].map(batch => batch.courseId) } }).select("courseCode name").lean()).map(course => [String(course._id), course]));
    const creators = new Map((await AuthModel.find({ _id: { $in: tasks.map(task => task.createdBy) } }).select("fullName").lean()).map(user => [String(user._id), user.fullName]));
    const today = todayKey();
    // Assignments: how many of the section's / batch's students have submitted.
    const counts = new Map((await TaskSubmission.aggregate([{ $match: { task: { $in: tasks.map(task => task._id) } } }, { $group: { _id: "$task", count: { $sum: 1 } } }])).map(row => [String(row._id), row.count]));
    const strength = new Map((await BatchService.getAllBatches({ adminId: tasks[0].adminId })).map(batch => [String(batch._id), batch.students]));
    return tasks.map(task => {
      const batch = batches.get(String(task.batchId));
      const course = batch ? courses.get(String(batch.courseId)) : undefined;
      return {
        _id: task._id, taskCode: task.taskCode, kind: task.kind, title: task.title, subject: task.subject, dueDate: task.dueDate,
        description: task.description, attachment: task.attachment, status: task.status,
        overdue: task.status === "assigned" && dayKey(task.dueDate) < today,
        batch: batch ? { batchCode: batch.batchCode, name: batch.name, label: this.label(batch, course?.name) } : null,
        course: course ? { courseCode: course.courseCode, name: course.name } : null,
        createdBy: creators.get(String(task.createdBy)) ?? null, canManage: this.canManage(task, actor), createdAt: task.createdAt,
        submitted: counts.get(String(task._id)) ?? 0, students: strength.get(String(task.batchId)) ?? 0,
      };
    });
  }

  /** Students of the task's section / batch. */
  static async roster(task: Record<string, any>) {
    const batch = await Batch.findById(task.batchId).lean();
    if (!batch) return [];
    const course = await Course.findById(batch.courseId).select("name").lean();
    const students = await StudentDetailsModel.find({ adminId: task.adminId, workType: task.workType }).select("studentCode fullName schoolInfo coachingInfo workType").lean();
    return students.filter(student => BatchService.studentInBatch(student, batch, course?.name)).sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || "")));
  }

  /** Teacher: every student of the assignment's section / batch with their submission (or none yet). */
  static async submissions(identifier: string, actor: StaffActor) {
    const task = await findScoped(Task, "taskCode", identifier, actorScope(actor), "homework / assignment");
    if (!this.canManage(task, actor)) throw statusError("Only the teacher who gave this can see its submissions", HttpStatus.FORBIDDEN);
    const [students, submissions] = await Promise.all([this.roster(task), TaskSubmission.find({ task: task._id }).lean()]);
    const byStudent = new Map(submissions.map(submission => [String(submission.student), submission]));
    return {
      taskCode: task.taskCode, title: task.title, kind: task.kind, dueDate: task.dueDate,
      students: students.map(student => {
        const submission = byStudent.get(String(student._id));
        return {
          studentCode: student.studentCode, fullName: student.fullName, rollNo: student.schoolInfo?.rollNumber ?? null,
          submission: submission ? { file: submission.file, submittedAt: submission.updatedAt, late: dayKey(submission.updatedAt) > dayKey(task.dueDate), status: submission.status, remark: submission.remark } : null,
        };
      }),
    };
  }

  /** Teacher marks a submission checked (or back to submitted), with an optional remark the student sees. */
  static async review(identifier: string, studentCode: string, input: { checked: boolean; remark?: string | null }, actor: StaffActor) {
    const task = await findScoped(Task, "taskCode", identifier, actorScope(actor), "homework / assignment");
    if (!this.canManage(task, actor)) throw statusError("Only the teacher who gave this can check its submissions", HttpStatus.FORBIDDEN);
    const student = await StudentDetailsModel.findOne({ adminId: task.adminId, studentCode }).select("_id").lean();
    const submission = student && await TaskSubmission.findOne({ task: task._id, student: student._id });
    if (!submission) throw statusError("This student has not submitted yet", HttpStatus.NOT_FOUND);
    submission.status = input.checked ? "checked" : "submitted";
    if (input.remark !== undefined) submission.remark = input.remark || null;
    submission.checkedBy = input.checked ? actor.userId as any : null;
    submission.checkedAt = input.checked ? new Date() : null;
    await submission.save();
    return { studentCode, status: submission.status, remark: submission.remark };
  }

  /** Portal: homework and assignments for the student's sections / batches, with the student's own submission. */
  static async forStudent(student: Record<string, any>) {
    const batches = await Batch.find({ adminId: student.adminId, workType: student.workType }).lean();
    const courses = new Map((await Course.find({ _id: { $in: batches.map(batch => batch.courseId) } }).select("name").lean()).map(course => [String(course._id), course.name]));
    const mine = batches.filter(batch => BatchService.studentInBatch(student, batch, courses.get(String(batch.courseId))));
    if (!mine.length) return [];
    const tasks = await Task.find({ batchId: { $in: mine.map(batch => batch._id) } }).sort({ dueDate: 1, createdAt: -1 }).lean();
    const submissions = new Map((await TaskSubmission.find({ task: { $in: tasks.map(task => task._id) }, student: student._id }).lean()).map(submission => [String(submission.task), submission]));
    const today = todayKey();
    return tasks.map(task => {
      const submission = submissions.get(String(task._id));
      return {
        taskCode: task.taskCode, kind: task.kind, title: task.title, subject: task.subject, description: task.description,
        givenOn: task.createdAt, dueDate: task.dueDate, attachment: task.attachment, status: task.status,
        overdue: task.status === "assigned" && dayKey(task.dueDate) < today,
        submission: submission ? { file: submission.file, submittedAt: submission.updatedAt, status: submission.status, remark: submission.remark } : null,
      };
    });
  }

  /** Portal: a student uploads (or replaces) their file for an open assignment. */
  static async submit(student: Record<string, any>, taskCode: string, file: { url: string; name: string }) {
    const task = (await this.forStudent(student)).find(item => item.taskCode === taskCode);
    if (!task || task.kind !== "assignment") throw statusError("Assignment not found", HttpStatus.NOT_FOUND);
    if (task.status === "closed") throw statusError("This assignment is closed", HttpStatus.CONFLICT);
    if (task.submission?.status === "checked") throw statusError("Your teacher has already checked this submission", HttpStatus.CONFLICT);
    if (!isOwnStoredFile(file.url, "portal", student.adminId)) throw statusError("Upload the file through the file upload first", HttpStatus.BAD_REQUEST);
    const saved = await Task.findOne({ taskCode }).select("_id").lean();
    const previous = await TaskSubmission.findOne({ task: saved._id, student: student._id }).lean();
    await TaskSubmission.updateOne({ task: saved._id, student: student._id }, { $set: { file, status: "submitted", adminId: student.adminId } }, { upsert: true });
    if (previous && previous.file.url !== file.url) removeStoredFile(previous.file.url, "portal");
    return (await this.forStudent(student)).find(item => item.taskCode === taskCode);
  }
}
