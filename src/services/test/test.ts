import HttpStatus from "http-status-codes";
import mongoose from "mongoose";
import Test, { AdmitCardLog, TestMark } from "../../model/test/test.js";
import Subject from "../../model/subject/subject.js";
import FeeModel from "../../model/fee/fee.js";
import AuthModel from "../../model/Auth/auth.js";
import Course from "../../model/teacher/courseModel.js";
import Batch from "../../model/teacher/batchModel.js";
import StudentDetailsModel from "../../model/students/studentInfo.js";
import { BatchService } from "../teacher/batchServices.js";
import { escapeRegex, parseDay, studentPlacement, todayKey } from "../../utilis/ownerScope.js";
import { generateSixDigitId } from "../../utilis/generateId.js";
import { StaffActor, isOwnerLike, teacherBatchIds } from "../../utilis/staffAccess.js";

const statusError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const dayKey = (date: Date | string) => new Date(date).toISOString().slice(0, 10);
const listHas = (text: unknown, name: string) => new RegExp(`(^|,)\\s*${escapeRegex(name)}\\s*(,|$)`, "i").test(String(text ?? ""));
const codeOrId = (value: string, codeField: string) => {
  const text = String(value ?? "").trim();
  if (/^\d{6}$/.test(text)) return { [codeField]: text };
  if (mongoose.Types.ObjectId.isValid(text)) return { _id: text };
  return null;
};

export type TestActor = StaffActor;

export type TestStatus = "scheduled" | "completed" | "published" | "cancelled";

/** Coaching letter grades; schools use the CBSE 8-point scale. */
export const gradeFor = (percent: number, workType: string) => {
  if (workType === "school") {
    return percent > 90 ? "A1" : percent > 80 ? "A2" : percent > 70 ? "B1" : percent > 60 ? "B2" : percent > 50 ? "C1" : percent > 40 ? "C2" : percent >= 33 ? "D" : "E";
  }
  return percent >= 90 ? "A+" : percent >= 80 ? "A" : percent >= 70 ? "B+" : percent >= 60 ? "B" : percent >= 50 ? "C" : percent >= 40 ? "D" : "F";
};
const defaultPassPercent = (workType: string) => workType === "school" ? 33 : 40;
const same = (a: unknown, b: unknown) => !!a && !!b && String(a) === String(b);
const sameText = (a: unknown, b: unknown) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
const clockMinutes = (time: string) => { const [hours, mins] = time.split(":").map(Number); return hours * 60 + mins; };
const ROSTER_FIELDS = "studentCode fullName coachingInfo.batchTiming coachingInfo.course schoolInfo.className schoolInfo.section schoolInfo.rollNumber schoolInfo.optionalSubjects workType";

export type AdmitStatus = "eligible" | "allowed" | "fee_pending" | "not_released" | "cancelled";

export class TestService {

  /** Owners manage every test; a teacher manages tests whose batches / sections are all theirs. */
  private static canManage(test: Record<string, any>, actor: TestActor, myBatches: string[]) {
    if (actor.role === "admin" || actor.role === "superAdmin") return true;
    if (actor.role !== "teacher" || !test.batchIds?.length) return false;
    return test.batchIds.every(id => myBatches.includes(String(id)));
  }

  /** Marks can be entered by whoever manages the test, and in schools by teachers of that subject. */
  private static canEnterMarks(test: Record<string, any>, paper: Record<string, any>, actor: TestActor, myBatches: string[]) {
    if (this.canManage(test, actor, myBatches)) return true;
    return test.workType === "school" && actor.role === "teacher" && (actor.teacher?.subjects || []).some(subject => subject.toLowerCase() === String(paper.subject).toLowerCase());
  }

  private static canView(test: Record<string, any>, actor: TestActor, myBatches: string[]) {
    return this.canManage(test, actor, myBatches) || test.papers.some(paper => this.canEnterMarks(test, paper, actor, myBatches));
  }

  static statusOf(test: Record<string, any>): TestStatus {
    if (test.cancelled) return "cancelled";
    if (test.resultsPublished) return "published";
    const last = test.papers.reduce((latest: string, paper) => dayKey(paper.date) > latest ? dayKey(paper.date) : latest, "");
    return last && todayKey() > last ? "completed" : "scheduled";
  }

  /** Names of a school class's optional (elective) subjects, set up under Subjects. */
  static async optionalSubjectNames(adminId: unknown, courseIds: unknown[]): Promise<string[]> {
    if (!courseIds.length) return [];
    const subjects = await Subject.find({ adminId, courseId: { $in: courseIds }, optional: true }).select("name").sort({ name: 1 }).lean();
    return [...new Set(subjects.map(subject => subject.name))];
  }

  /** Lower-cased names of the exam class's optional subjects. Coaching tests have none. */
  static async optionalSubjects(test: Record<string, any>): Promise<Set<string>> {
    if (test.workType !== "school") return new Set();
    return new Set((await this.optionalSubjectNames(test.adminId, [test.courseId])).map(name => name.toLowerCase()));
  }

  /** Checks a student's choice against the class's optional subjects and returns the names as stored on the subjects. */
  static async checkOptionalChoice(adminId: unknown, courseIds: unknown[], subjects: string[]) {
    const options = await this.optionalSubjectNames(adminId, courseIds);
    const chosen = [...new Set(subjects.map(name => String(name).trim()).filter(Boolean))];
    const unknown = chosen.filter(name => !options.some(option => sameText(option, name)));
    if (unknown.length) throw statusError(`${unknown.join(", ")} ${unknown.length === 1 ? "is not an optional subject" : "are not optional subjects"} of this class`, HttpStatus.BAD_REQUEST);
    return options.filter(option => chosen.some(name => sameText(option, name)));
  }

  /** Everyone sits a compulsory paper; an optional subject's paper only students who chose it. */
  static takesPaper(student: Record<string, any>, paper: Record<string, any>, optional: Set<string>) {
    if (!optional.has(String(paper.subject).toLowerCase())) return true;
    return (student.schoolInfo?.optionalSubjects || []).some(name => sameText(name, paper.subject));
  }

  /** First paper of the exam as YYYY-MM-DD (fees due on or before it must be cleared for the admit card). */
  static firstPaperDay(test: Record<string, any>) {
    return test.papers.reduce((first: string, paper) => !first || dayKey(paper.date) < first ? dayKey(paper.date) : first, "");
  }

  /** Unpaid fees per student whose due date is on or before `day` (fees without a due date count as due). */
  static async pendingFees(studentIds: unknown[], day: string) {
    const fees = studentIds.length ? await FeeModel.find({ student: { $in: studentIds } }).select("student period totalFee discount paidAmount dueDate").lean() : [];
    const pending = new Map<string, { amount: number; periods: string[] }>();
    for (const fee of fees) {
      const due = Math.max(0, (fee.totalFee || 0) - (fee.discount || 0) - (fee.paidAmount || 0));
      if (!due || (fee.dueDate && dayKey(fee.dueDate) > day)) continue;
      const row = pending.get(String(fee.student)) ?? { amount: 0, periods: [] };
      row.amount += due;
      row.periods.push(fee.period);
      pending.set(String(fee.student), row);
    }
    return pending;
  }

  /** Whether the student may download their own admit card. Staff can always print it (unless the exam is cancelled). */
  static admitStatus(test: Record<string, any>, student: Record<string, any>, feeDue: number): AdmitStatus {
    if (test.cancelled) return "cancelled";
    if (!test.admitCard?.released) return "not_released";
    if (!test.admitCard.feeRequired || feeDue <= 0) return "eligible";
    return (test.admitCard.allowedStudentIds || []).some(id => same(id, student._id)) ? "allowed" : "fee_pending";
  }

  /** One student's admit card: their details and only the papers they sit, in date order. */
  static admitCard(test: Record<string, any>, course: Record<string, any> | null, student: Record<string, any>, optional: Set<string>) {
    const { course: className, batch } = studentPlacement(student);
    return {
      admitNo: `${test.testCode}-${student.studentCode}`,
      exam: { testCode: test.testCode, name: test.name, term: test.term, className: course?.name ?? className, startTime: test.startTime ?? null, endTime: test.endTime ?? null, instructions: test.admitCard?.instructions ?? null },
      student: {
        studentCode: student.studentCode, fullName: student.fullName, className, section: batch, rollNumber: student.schoolInfo?.rollNumber ?? null,
        fatherName: student.parentsInfo?.fatherName ?? null, motherName: student.parentsInfo?.motherName ?? null,
        dateOfBirth: student.dateOfBirth ?? null, gender: student.gender ?? null, profileImage: student.profileImage ?? null,
      },
      papers: test.papers.filter(paper => this.takesPaper(student, paper, optional))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map(paper => ({ subject: paper.subject, date: paper.date, maxMarks: paper.maxMarks })),
      issuedAt: new Date(),
    };
  }

  static async logAdmitDownloads(test: Record<string, any>, studentIds: unknown[], user: { userId: unknown; role: string; name?: string | null }) {
    if (!studentIds.length) return;
    await AdmitCardLog.insertMany(studentIds.map(studentId => ({ adminId: test.adminId, testId: test._id, studentId, downloadedBy: user.userId, role: user.role, name: user.name ?? null })));
  }

  private static scopeFilter(actor: TestActor) {
    return actor.role === "superAdmin" ? {} : { adminId: actor.adminId, workType: actor.workType };
  }

  /** Resolves course (school: class) and batches (school: sections) and applies the coaching / school rules. */
  private static async prepare(input: Record<string, any>, actor: TestActor, current?: Record<string, any>) {
    const workType = current?.workType ?? actor.workType;
    const adminId = current?.adminId ?? actor.adminId;
    const data: Record<string, any> = {};
    if (input.name !== undefined) data.name = String(input.name).trim();
    if (input.term !== undefined) data.term = workType === "school" ? (String(input.term || "").trim() || null) : null;

    if (input.batchCodes !== undefined || input.courseCode !== undefined) {
      const batchCodes: string[] = input.batchCodes ?? [];
      const matches = batchCodes.map(code => codeOrId(code, "batchCode"));
      if (matches.some(match => !match)) throw statusError("Invalid batch ID", HttpStatus.BAD_REQUEST);
      const batches = matches.length ? await Batch.find({ adminId, $or: matches }).lean() : [];
      if (batches.length !== new Set(batchCodes).size) throw statusError(workType === "school" ? "Section not found" : "Batch not found", HttpStatus.BAD_REQUEST);
      if (workType === "coaching") {
        if (batches.length !== 1) throw statusError("Choose one batch for the test", HttpStatus.BAD_REQUEST);
        data.courseId = batches[0].courseId;
      } else {
        const match = codeOrId(input.courseCode ?? "", "courseCode");
        const course = match ? await Course.findOne({ ...match, adminId, workType }).select("_id").lean() : current ? { _id: current.courseId } : null;
        if (!course) throw statusError("Choose the class for the exam", HttpStatus.BAD_REQUEST);
        if (batches.some(batch => String(batch.courseId) !== String(course._id))) throw statusError("Every section must belong to the chosen class", HttpStatus.BAD_REQUEST);
        data.courseId = course._id;
      }
      data.batchIds = batches.map(batch => batch._id);
    }

    if (input.papers !== undefined) {
      if (workType === "coaching" && input.papers.length !== 1) throw statusError("A test has one subject", HttpStatus.BAD_REQUEST);
      const subjects = input.papers.map(paper => paper.subject.toLowerCase());
      if (new Set(subjects).size !== subjects.length) throw statusError("Each subject can appear only once in the date sheet", HttpStatus.BAD_REQUEST);
      const existingIds = new Set((current?.papers || []).map(paper => String(paper._id)));
      data.papers = input.papers.map(paper => {
        if (paper.passMarks != null && paper.passMarks > paper.maxMarks) throw statusError(`Pass marks for ${paper.subject} cannot exceed maximum marks`, HttpStatus.BAD_REQUEST);
        const kept = paper.paperId && existingIds.has(paper.paperId) ? { _id: paper.paperId } : {};
        return { ...kept, subject: paper.subject, date: parseDay(paper.date, `${paper.subject} date`), maxMarks: paper.maxMarks, passMarks: paper.passMarks ?? null };
      });
    }
    if (workType === "school") {
      for (const key of ["startTime", "endTime"]) if (input[key] !== undefined) data[key] = String(input[key] || "").trim() || null;
      const start = data.startTime !== undefined ? data.startTime : current?.startTime;
      const end = data.endTime !== undefined ? data.endTime : current?.endTime;
      if (start && end && clockMinutes(end) <= clockMinutes(start)) throw statusError("Exam end time must be after the start time", HttpStatus.BAD_REQUEST);
      if (input.admitCard !== undefined) {
        const before = { released: false, feeRequired: false, instructions: null, allowedStudentIds: [], ...(current?.admitCard || {}) };
        const next = { ...before };
        if (input.admitCard.released !== undefined) next.released = input.admitCard.released;
        if (input.admitCard.feeRequired !== undefined) next.feeRequired = input.admitCard.feeRequired;
        if (input.admitCard.instructions !== undefined) next.instructions = String(input.admitCard.instructions || "").trim() || null;
        const changed = next.released !== before.released || next.feeRequired !== before.feeRequired || next.instructions !== before.instructions;
        if (changed && !isOwnerLike(actor)) throw statusError("Only the owner / principal can change admit card settings", HttpStatus.FORBIDDEN);
        data.admitCard = next;
      }
    }
    if (input.cancelled !== undefined) data.cancelled = input.cancelled;
    return data;
  }

  static async createTest(input: Record<string, any>, actor: TestActor) {
    if (!actor.adminId || !actor.workType) throw statusError("Only an Owner or teacher can schedule tests", HttpStatus.FORBIDDEN);
    const data = { adminId: actor.adminId, workType: actor.workType, createdBy: actor.userId, ...await this.prepare(input, actor) };
    const myBatches = await teacherBatchIds(actor);
    if (!this.canManage(data, actor, myBatches)) throw statusError("You can schedule tests only for batches / sections you teach", HttpStatus.FORBIDDEN);
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const test = await Test.create({ ...data, testCode: generateSixDigitId() });
        return (await this.present([test.toObject()], actor, myBatches))[0];
      } catch (error) {
        if (!(error.code === 11000 && error.keyPattern?.testCode) || attempt === 9) throw error;
      }
    }
    throw new Error("Unable to generate a unique test ID");
  }

  private static async findTest(identifier: string, actor: TestActor) {
    const match = codeOrId(identifier, "testCode");
    if (!match) throw statusError("Invalid test ID", HttpStatus.BAD_REQUEST);
    const test = await Test.findOne({ ...match, ...this.scopeFilter(actor) }).lean();
    const myBatches = await teacherBatchIds(actor);
    if (!test || !this.canView(test, actor, myBatches)) throw statusError("Test not found", HttpStatus.NOT_FOUND);
    return { test, myBatches };
  }

  static async getAllTests(actor: TestActor) {
    const myBatches = await teacherBatchIds(actor);
    const tests = (await Test.find(this.scopeFilter(actor)).sort({ createdAt: -1 }).lean()).filter(test => this.canView(test, actor, myBatches));
    return this.present(tests, actor, myBatches);
  }

  static async getTest(identifier: string, actor: TestActor) {
    const { test, myBatches } = await this.findTest(identifier, actor);
    return (await this.present([test], actor, myBatches))[0];
  }

  static async updateTest(identifier: string, input: Record<string, any>, actor: TestActor) {
    const { test, myBatches } = await this.findTest(identifier, actor);
    if (!this.canManage(test, actor, myBatches)) throw statusError("You can edit tests only for batches / sections you teach", HttpStatus.FORBIDDEN);
    if (test.resultsPublished) throw statusError("Results are published. Unpublish them before editing the test.", HttpStatus.CONFLICT);
    const update = await this.prepare(input, actor, test);
    const next = { ...test, ...update };
    if (!this.canManage(next, actor, myBatches)) throw statusError("You can schedule tests only for batches / sections you teach", HttpStatus.FORBIDDEN);
    const hasMarks = await TestMark.exists({ testId: test._id });
    const movedGroup = String(next.courseId) !== String(test.courseId) || next.batchIds.map(String).sort().join() !== test.batchIds.map(String).sort().join();
    if (hasMarks && movedGroup) throw statusError("Marks are already entered, so the batch / class cannot change", HttpStatus.CONFLICT);
    const saved = await Test.findByIdAndUpdate(test._id, { $set: update }, { new: true, runValidators: true }).lean();
    // Papers removed from the date sheet take their marks with them.
    if (update.papers) await TestMark.deleteMany({ testId: test._id, paperId: { $nin: saved.papers.map(paper => paper._id) } });
    return (await this.present([saved], actor, myBatches))[0];
  }

  static async deleteTest(identifier: string, actor: TestActor) {
    const { test, myBatches } = await this.findTest(identifier, actor);
    if (!this.canManage(test, actor, myBatches)) throw statusError("You can delete tests only for batches / sections you teach", HttpStatus.FORBIDDEN);
    if (test.resultsPublished) throw statusError("Results are published. Unpublish them before deleting the test.", HttpStatus.CONFLICT);
    await TestMark.deleteMany({ testId: test._id });
    await Test.deleteOne({ _id: test._id });
    return { message: "Test deleted successfully", test };
  }

  /** Students who sit the test: the batch (coaching) or the class / chosen sections (school). */
  static async roster(test: Record<string, any>) {
    const course = await Course.findById(test.courseId).select("name").lean();
    const batches = test.batchIds.length ? await Batch.find({ _id: { $in: test.batchIds } }).lean() : [];
    const students = await StudentDetailsModel.find({ adminId: test.adminId, workType: test.workType })
      .select(ROSTER_FIELDS).lean();
    return students.filter(student => {
      if (test.workType === "school" && !batches.length) return !!course && listHas(student.schoolInfo?.className, course.name);
      return batches.some(batch => BatchService.studentInBatch(student, batch, course?.name));
    }).sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || "")));
  }

  /** Adds course, batches, status, permissions and how many marks each paper has. */
  private static async present(tests: Record<string, any>[], actor: TestActor, myBatches: string[]) {
    if (!tests.length) return [];
    const courses = await Course.find({ _id: { $in: tests.map(test => test.courseId) } }).select("courseCode name").lean();
    const batches = await Batch.find({ _id: { $in: tests.flatMap(test => test.batchIds) } }).select("batchCode name").lean();
    const counts = await TestMark.aggregate([
      { $match: { testId: { $in: tests.map(test => test._id) }, $or: [{ marks: { $ne: null } }, { absent: true }] } },
      { $group: { _id: { testId: "$testId", paperId: "$paperId" }, entered: { $sum: 1 } } },
    ]);
    const courseById = new Map(courses.map(course => [String(course._id), course]));
    const batchById = new Map(batches.map(batch => [String(batch._id), batch]));
    const entered = new Map(counts.map(row => [`${row._id.testId}:${row._id.paperId}`, row.entered]));
    return Promise.all(tests.map(async test => {
      const course = courseById.get(String(test.courseId));
      const roster = await this.roster(test);
      const students = roster.length;
      const optional = await this.optionalSubjects(test);
      return {
        _id: test._id, testCode: test.testCode, workType: test.workType, name: test.name, term: test.term,
        course: course ? { courseCode: course.courseCode, name: course.name } : null,
        batches: test.batchIds.map(id => batchById.get(String(id))).filter(Boolean).map(batch => ({ batchCode: batch.batchCode, name: batch.name })),
        papers: test.papers.map(paper => ({
          paperId: String(paper._id), subject: paper.subject, date: paper.date, maxMarks: paper.maxMarks, passMarks: paper.passMarks,
          entered: entered.get(`${test._id}:${paper._id}`) ?? 0, canEnterMarks: this.canEnterMarks(test, paper, actor, myBatches),
          optional: optional.has(String(paper.subject).toLowerCase()), students: roster.filter(student => this.takesPaper(student, paper, optional)).length,
        })),
        startTime: test.startTime ?? null, endTime: test.endTime ?? null,
        admitCard: test.workType === "school" ? { released: !!test.admitCard?.released, feeRequired: !!test.admitCard?.feeRequired, instructions: test.admitCard?.instructions ?? null, allowed: test.admitCard?.allowedStudentIds?.length ?? 0 } : null,
        students, status: this.statusOf(test), cancelled: test.cancelled, resultsPublished: test.resultsPublished, publishedAt: test.publishedAt,
        canManage: this.canManage(test, actor, myBatches), createdAt: test.createdAt,
      };
    }));
  }

  private static paperOf(test: Record<string, any>, paperId: string) {
    const paper = test.papers.find(item => String(item._id) === String(paperId));
    if (!paper) throw statusError("Subject not found in this test", HttpStatus.NOT_FOUND);
    return paper;
  }

  /** The marks sheet for one paper: every student of the test with their saved marks. */
  static async getMarks(identifier: string, paperId: string, actor: TestActor) {
    const { test, myBatches } = await this.findTest(identifier, actor);
    const paper = this.paperOf(test, paperId);
    const optional = await this.optionalSubjects(test);
    const students = (await this.roster(test)).filter(student => this.takesPaper(student, paper, optional));
    const marks = await TestMark.find({ testId: test._id, paperId: paper._id }).lean();
    const byStudent = new Map(marks.map(mark => [String(mark.studentId), mark]));
    return {
      testCode: test.testCode, name: test.name, paper: { paperId: String(paper._id), subject: paper.subject, date: paper.date, maxMarks: paper.maxMarks, passMarks: paper.passMarks },
      editable: !test.cancelled && !test.resultsPublished && dayKey(paper.date) <= todayKey() && this.canEnterMarks(test, paper, actor, myBatches),
      resultsPublished: test.resultsPublished,
      students: students.map(student => {
        const mark = byStudent.get(String(student._id));
        const { course, batch } = studentPlacement(student);
        return { studentCode: student.studentCode, fullName: student.fullName, rollNo: student.schoolInfo?.rollNumber ?? null, course, batch, marks: mark?.marks ?? null, absent: mark?.absent ?? false, remarks: mark?.remarks ?? null };
      }),
    };
  }

  static async saveMarks(identifier: string, input: { paperId: string; entries: Record<string, any>[] }, actor: TestActor) {
    const { test, myBatches } = await this.findTest(identifier, actor);
    const paper = this.paperOf(test, input.paperId);
    if (!this.canEnterMarks(test, paper, actor, myBatches)) throw statusError("You cannot enter marks for this subject", HttpStatus.FORBIDDEN);
    if (test.cancelled) throw statusError("This test is cancelled", HttpStatus.CONFLICT);
    if (test.resultsPublished) throw statusError("Results are published. Unpublish them to change marks.", HttpStatus.CONFLICT);
    if (dayKey(paper.date) > todayKey()) throw statusError(`Marks can be entered from ${dayKey(paper.date)}, the day of the ${paper.subject} paper`, HttpStatus.BAD_REQUEST);
    const optional = await this.optionalSubjects(test);
    const students = new Map((await this.roster(test)).filter(student => this.takesPaper(student, paper, optional)).map(student => [student.studentCode, student]));
    const operations = input.entries.map(entry => {
      const student = students.get(entry.studentCode);
      if (!student) throw statusError(`Student ${entry.studentCode} does not sit the ${paper.subject} paper of this test`, HttpStatus.BAD_REQUEST);
      const marks = entry.absent ? null : entry.marks ?? null;
      if (marks != null && marks > paper.maxMarks) throw statusError(`${student.fullName || entry.studentCode}: marks cannot exceed ${paper.maxMarks}`, HttpStatus.BAD_REQUEST);
      return {
        updateOne: {
          filter: { testId: test._id, paperId: paper._id, studentId: student._id },
          update: { $set: { adminId: test.adminId, marks, absent: !!entry.absent, remarks: entry.remarks || null, enteredBy: actor.userId } },
          upsert: true,
        },
      };
    });
    await TestMark.bulkWrite(operations);
    return this.getMarks(identifier, input.paperId, actor);
  }

  /** Publishing needs every paper held and every student's marks (or absence) entered. */
  static async setPublished(identifier: string, publish: boolean, actor: TestActor) {
    const { test, myBatches } = await this.findTest(identifier, actor);
    if (!this.canManage(test, actor, myBatches)) throw statusError("You can publish results only for batches / sections you teach", HttpStatus.FORBIDDEN);
    if (publish) {
      if (test.cancelled) throw statusError("This test is cancelled", HttpStatus.CONFLICT);
      const pending = test.papers.filter(paper => dayKey(paper.date) > todayKey());
      if (pending.length) throw statusError(`${pending.map(paper => paper.subject).join(", ")} ${pending.length === 1 ? "is" : "are"} not held yet`, HttpStatus.BAD_REQUEST);
      const students = await this.roster(test);
      if (!students.length) throw statusError("No students are in this test", HttpStatus.BAD_REQUEST);
      const marks = await TestMark.find({ testId: test._id, $or: [{ marks: { $ne: null } }, { absent: true }] }).select("paperId studentId").lean();
      const done = new Set(marks.map(mark => `${mark.paperId}:${mark.studentId}`));
      const optional = await this.optionalSubjects(test);
      const missing = test.papers.map(paper => ({ subject: paper.subject, count: students.filter(student => this.takesPaper(student, paper, optional) && !done.has(`${paper._id}:${student._id}`)).length })).filter(row => row.count);
      if (missing.length) throw statusError(`Marks missing — ${missing.map(row => `${row.subject}: ${row.count} student${row.count === 1 ? "" : "s"}`).join("; ")}. Enter marks or mark them absent.`, HttpStatus.BAD_REQUEST);
    }
    const saved = await Test.findByIdAndUpdate(test._id, { $set: { resultsPublished: publish, publishedAt: publish ? new Date() : null } }, { new: true }).lean();
    return (await this.present([saved], actor, myBatches))[0];
  }

  /**
   * Results page: one row per student per paper with marks, percentage and grade.
   * Owners and teachers see drafts (entered, not yet published) as well as published results.
   */
  static async getResults(actor: TestActor, { status }: { status?: string } = {}) {
    const myBatches = await teacherBatchIds(actor);
    const tests = (await Test.find({ ...this.scopeFilter(actor), cancelled: false, ...(status === "published" ? { resultsPublished: true } : status === "draft" ? { resultsPublished: false } : {}) }).lean())
      .filter(test => this.canView(test, actor, myBatches));
    if (!tests.length) return [];
    const marks = await TestMark.find({ testId: { $in: tests.map(test => test._id) }, $or: [{ marks: { $ne: null } }, { absent: true }] }).lean();
    const students = await StudentDetailsModel.find({ _id: { $in: [...new Set(marks.map(mark => String(mark.studentId)))] } })
      .select("studentCode fullName workType coachingInfo.course coachingInfo.batchTiming coachingInfo.className schoolInfo.className schoolInfo.section").lean();
    const courses = await Course.find({ _id: { $in: tests.map(test => test.courseId) } }).select("name").lean();
    const testById = new Map(tests.map(test => [String(test._id), test]));
    const studentById = new Map(students.map(student => [String(student._id), student]));
    const courseById = new Map(courses.map(course => [String(course._id), course.name]));
    return marks.flatMap(mark => {
      const test = testById.get(String(mark.testId));
      const student = studentById.get(String(mark.studentId));
      const paper = test?.papers.find(item => String(item._id) === String(mark.paperId));
      if (!test || !student || !paper || !test.papers.some(item => this.canEnterMarks(test, item, actor, myBatches) || this.canManage(test, actor, myBatches))) return [];
      const percent = mark.absent ? 0 : Math.round(((mark.marks ?? 0) / paper.maxMarks) * 1000) / 10;
      const passMarks = paper.passMarks ?? Math.ceil((paper.maxMarks * defaultPassPercent(test.workType)) / 100);
      const { batch } = studentPlacement(student);
      return [{
        id: String(mark._id), testCode: test.testCode, exam: test.name, term: test.term, course: courseById.get(String(test.courseId)) || "—", batch,
        studentCode: student.studentCode, student: student.fullName, subject: paper.subject, examDate: paper.date,
        marks: mark.marks, total: paper.maxMarks, absent: mark.absent, percentage: percent, grade: mark.absent ? "AB" : gradeFor(percent, test.workType),
        passed: !mark.absent && (mark.marks ?? 0) >= passMarks, published: test.resultsPublished,
      }];
    }).sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime() || String(a.student).localeCompare(String(b.student)));
  }

  /**
   * A school exam for the Admit cards screen. The owner (principal) sees every student of the exam;
   * a class teacher sees the students of their own sections only.
   */
  private static async admitScope(identifier: string, actor: TestActor) {
    const match = codeOrId(identifier, "testCode");
    if (!match) throw statusError("Invalid exam ID", HttpStatus.BAD_REQUEST);
    const test = await Test.findOne({ ...match, ...this.scopeFilter(actor) }).lean();
    if (!test || test.workType !== "school") throw statusError("Exam not found", HttpStatus.NOT_FOUND);
    const course = await Course.findById(test.courseId).select("name").lean();
    let students = await this.roster(test);
    const owner = isOwnerLike(actor);
    if (!owner) {
      const myBatches = await teacherBatchIds(actor);
      const sections = myBatches.length ? await Batch.find({ _id: { $in: myBatches }, courseId: test.courseId }).lean() : [];
      if (!sections.length) throw statusError("Only the class teacher or the owner can open admit cards for this exam", HttpStatus.FORBIDDEN);
      students = students.filter(student => sections.some(section => BatchService.studentInBatch(student, section, course?.name)));
    }
    return { test, course, students, owner };
  }

  private static studentIn(students: Record<string, any>[], studentCode: string) {
    const student = students.find(item => item.studentCode === studentCode);
    if (!student) throw statusError(`Student ${studentCode} is not in your list for this exam`, HttpStatus.BAD_REQUEST);
    return student;
  }

  /** Admit card list: each student's fee position, whether they can download, optional subjects and downloads so far. */
  static async getAdmitCards(identifier: string, actor: TestActor) {
    const { test, course, students, owner } = await this.admitScope(identifier, actor);
    const optionalNames = await this.optionalSubjectNames(test.adminId, [test.courseId]);
    const optional = new Set(optionalNames.map(name => name.toLowerCase()));
    const firstPaper = this.firstPaperDay(test);
    const pending = await this.pendingFees(students.map(student => student._id), firstPaper);
    const logs = students.length ? await AdmitCardLog.find({ testId: test._id, studentId: { $in: students.map(student => student._id) } }).sort({ createdAt: -1 }).lean() : [];
    return {
      testCode: test.testCode, name: test.name, term: test.term, className: course?.name ?? null, firstPaper,
      startTime: test.startTime ?? null, endTime: test.endTime ?? null, cancelled: test.cancelled,
      settings: { released: !!test.admitCard?.released, feeRequired: !!test.admitCard?.feeRequired, instructions: test.admitCard?.instructions ?? null },
      canAllow: owner,
      optionalSubjects: optionalNames,
      students: students.map(student => {
        const fee = pending.get(String(student._id));
        const mine = logs.filter(log => same(log.studentId, student._id));
        const { course: className, batch } = studentPlacement(student);
        return {
          studentCode: student.studentCode, fullName: student.fullName, rollNumber: student.schoolInfo?.rollNumber ?? null, className, section: batch,
          optionalSubjects: (student.schoolInfo?.optionalSubjects || []).filter(name => optional.has(String(name).toLowerCase())),
          papers: test.papers.filter(paper => this.takesPaper(student, paper, optional)).length,
          feeDue: fee?.amount ?? 0, feePeriods: fee?.periods ?? [],
          allowed: (test.admitCard?.allowedStudentIds || []).some(id => same(id, student._id)),
          status: this.admitStatus(test, student, fee?.amount ?? 0),
          downloads: mine.length,
          lastDownload: mine[0] ? { name: mine[0].name, role: mine[0].role, at: mine[0].createdAt } : null,
        };
      }),
    };
  }

  /** Owner only: let one fee-pending student download their own admit card (or take that back). */
  static async setAdmitAllowed(identifier: string, input: { studentCode: string; allowed: boolean }, actor: TestActor) {
    const { test, students, owner } = await this.admitScope(identifier, actor);
    if (!owner) throw statusError("Only the owner / principal can allow a student with pending fees", HttpStatus.FORBIDDEN);
    const student = this.studentIn(students, input.studentCode);
    await Test.updateOne({ _id: test._id }, input.allowed ? { $addToSet: { "admitCard.allowedStudentIds": student._id } } : { $pull: { "admitCard.allowedStudentIds": student._id } });
    return this.getAdmitCards(identifier, actor);
  }

  /** Class teacher / owner prints admit cards for one or more students, whatever their fees. Every card is logged. */
  static async downloadAdmitCards(identifier: string, input: { studentCodes: string[] }, actor: TestActor) {
    const { test, course, students } = await this.admitScope(identifier, actor);
    if (test.cancelled) throw statusError("This exam is cancelled", HttpStatus.CONFLICT);
    const chosen = [...new Set(input.studentCodes)].map(code => this.studentIn(students, code));
    const full = await StudentDetailsModel.find({ _id: { $in: chosen.map(student => student._id) } }).lean();
    const byId = new Map(full.map(student => [String(student._id), student]));
    const optional = await this.optionalSubjects(test);
    const cards = chosen.map(student => this.admitCard(test, course, byId.get(String(student._id)) ?? student, optional))
      .sort((a, b) => String(a.student.section).localeCompare(String(b.student.section)) || String(a.student.rollNumber ?? "").localeCompare(String(b.student.rollNumber ?? ""), undefined, { numeric: true }) || String(a.student.fullName ?? "").localeCompare(String(b.student.fullName ?? "")));
    const me = await AuthModel.findById(actor.userId).select("fullName").lean();
    await this.logAdmitDownloads(test, chosen.map(student => student._id), { userId: actor.userId, role: actor.role === "teacher" ? "class teacher" : "owner", name: me?.fullName ?? null });
    return cards;
  }

  /** Class teacher / owner sets the optional subjects a student takes (used by every exam of the class). */
  static async setStudentOptionalSubjects(identifier: string, studentCode: string, subjects: string[], actor: TestActor) {
    const { test, students } = await this.admitScope(identifier, actor);
    const student = this.studentIn(students, studentCode);
    const names = await this.checkOptionalChoice(test.adminId, [test.courseId], subjects);
    await StudentDetailsModel.updateOne({ _id: student._id }, { $set: { "schoolInfo.optionalSubjects": names } });
    return this.getAdmitCards(identifier, actor);
  }

}
