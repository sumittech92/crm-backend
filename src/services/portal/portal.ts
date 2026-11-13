import HttpStatus from "http-status-codes";
import AuthModel from "../../model/Auth/auth.js";
import StudentDetailsModel from "../../model/students/studentInfo.js";
import Batch from "../../model/teacher/batchModel.js";
import Course from "../../model/teacher/courseModel.js";
import Teacher from "../../model/teacher/teacherInfo.js";
import Subject from "../../model/subject/subject.js";
import AcademicSession from "../../model/session/session.js";
import Test, { TestMark } from "../../model/test/test.js";
import Material from "../../model/material/material.js";
import Notice from "../../model/notice/notice.js";
import Post from "../../model/post/post.js";
import SchoolEvent from "../../model/event/event.js";
import { BatchService } from "../teacher/batchServices.js";
import { AttendanceService } from "../attendance/attendance.js";
import { FeeService } from "../fee/fee.js";
import { FeeSubmissionService } from "../fee/feeSubmission.js";
import { TimetableService } from "../timetable/timetable.js";
import { TaskService } from "../task/task.js";
import { SyllabusService } from "../syllabus/syllabus.js";
import { TestService, gradeFor } from "../test/test.js";
import { EventService } from "../event/event.js";
import { noticeState } from "../notice/notice.js";
import { escapeRegex, studentPlacement, todayKey } from "../../utilis/ownerScope.js";
import { statusError } from "../../utilis/records.js";

const dayKey = (date: Date | string) => new Date(date).toISOString().slice(0, 10);
const listHas = (text: unknown, name: string) => new RegExp(`(^|,)\\s*${escapeRegex(name)}\\s*(,|$)`, "i").test(String(text ?? ""));
const same = (a: unknown, b: unknown) => !!a && !!b && String(a) === String(b);

/** The signed-in student, or the child a parent is looking at, plus the parent's children for the switcher. */
export type PortalContext = { user: Record<string, any>; student: Record<string, any>; children: Record<string, any>[] };

/**
 * Read-only views of one student's own data for the student / parent portal. Every method works from the
 * student record, so a student or parent can never reach another student's data.
 */
export class PortalService {

  static async resolve(user: Record<string, any>, role: string, childCode?: unknown): Promise<PortalContext> {
    if (role === "student") {
      const student = await StudentDetailsModel.findOne({ studentId: user._id }).lean();
      if (!student) throw statusError("Your student record was not found. Please contact the office.", HttpStatus.NOT_FOUND);
      return { user, student, children: [student] };
    }
    if (role === "parent") {
      const children = await StudentDetailsModel.find({ parentId: user._id }).sort({ fullName: 1 }).lean();
      if (!children.length) throw statusError("No children are linked to this account. Please contact the office.", HttpStatus.NOT_FOUND);
      const student = children.find(child => child.studentCode === String(childCode ?? "")) ?? children[0];
      return { user, student, children };
    }
    throw statusError("Only students and parents use the portal", HttpStatus.FORBIDDEN);
  }

  private static placementLabel(student: Record<string, any>) {
    const { course, batch } = studentPlacement(student);
    return student.workType === "school" ? `${course} · ${batch}` : batch !== "—" ? batch : course;
  }

  /** The student's sections / batches (with class / course name) and their course ids. */
  private static async groups(student: Record<string, any>) {
    const batches = await Batch.find({ adminId: student.adminId, workType: student.workType }).lean();
    const courses = await Course.find({ adminId: student.adminId }).select("name subjects").lean();
    const courseById = new Map(courses.map(course => [String(course._id), course]));
    const mine = batches.filter(batch => BatchService.studentInBatch(student, batch, courseById.get(String(batch.courseId))?.name));
    const enrolled = student.workType === "school" ? student.schoolInfo?.className : student.coachingInfo?.course || student.coachingInfo?.className;
    const courseIds = new Set([...mine.map(batch => String(batch.courseId)), ...courses.filter(course => listHas(enrolled, course.name)).map(course => String(course._id))]);
    return { batches: mine, courseIds, courseById };
  }

  static async me({ student, children }: PortalContext) {
    const account = await AuthModel.findById(student.studentId).select("email countryCode phoneNumber").lean();
    const info = student.workType === "school" ? student.schoolInfo : student.coachingInfo;
    return {
      children: children.map(child => ({ studentCode: child.studentCode, fullName: child.fullName, placement: this.placementLabel(child) })),
      student: {
        studentCode: student.studentCode, fullName: student.fullName, workType: student.workType, gender: student.gender, dateOfBirth: student.dateOfBirth,
        profileImage: student.profileImage, status: student.status ?? "active", email: account?.email ?? null,
        countryCode: account?.countryCode ?? null, phoneNumber: account?.phoneNumber ?? null,
        parentsInfo: student.parentsInfo ?? null, address: student.address ?? null,
        admissionDate: info?.admissionDate ?? null, rollNumber: student.schoolInfo?.rollNumber ?? null,
        ...studentPlacement(student), placement: this.placementLabel(student),
      },
    };
  }

  /** My Class (school) / My Batch (coaching): placement, teachers, room and classmates. */
  static async classInfo({ student }: PortalContext) {
    const { batches, courseById } = await this.groups(student);
    const presented = new Map((await BatchService.getAllBatches({ adminId: student.adminId, workType: student.workType })).map(batch => [String(batch._id), batch]));
    const teacherIds = batches.flatMap(batch => batch.teacherIds);
    const teachers = new Map((await Teacher.find({ _id: { $in: teacherIds } }).select("fullName coachingInfo.subjects schoolInfo.subjects").lean()).map(teacher => [String(teacher._id), teacher]));
    const session = await AcademicSession.findOne({ adminId: student.adminId, status: "current" }).select("name").lean();
    const groups = batches.map(batch => {
      const course = courseById.get(String(batch.courseId));
      return {
        batchCode: batch.batchCode, name: batch.name, course: course?.name ?? null, days: batch.days, startTime: batch.startTime, endTime: batch.endTime,
        startDate: batch.startDate, room: batch.room, students: presented.get(String(batch._id))?.students ?? 0,
        teachers: batch.teacherIds.map(id => teachers.get(String(id))).filter(Boolean).map(teacher => ({
          name: teacher.fullName,
          subjects: (teacher.coachingInfo?.subjects?.length ? teacher.coachingInfo.subjects : teacher.schoolInfo?.subjects || [])
            .filter(subject => !course?.subjects?.length || course.subjects.some(own => own.toLowerCase() === subject.toLowerCase())),
        })),
      };
    });
    return { session: session?.name ?? null, rollNumber: student.schoolInfo?.rollNumber ?? null, groups };
  }

  /** School: subjects of the student's class with the teacher of their section. */
  static async subjects({ student }: PortalContext) {
    const { batches } = await this.groups(student);
    const section = batches[0];
    if (!section) return [];
    const subjects = await Subject.find({ adminId: student.adminId, courseId: section.courseId, status: "active" }).sort({ name: 1 }).lean();
    const teacherIds = subjects.map(subject => TimetableService.teacherOf(subject, section._id)).filter(Boolean);
    const teachers = new Map((await Teacher.find({ _id: { $in: teacherIds } }).select("fullName").lean()).map(teacher => [String(teacher._id), teacher.fullName]));
    return subjects.map(subject => ({ name: subject.name, code: subject.code, periodsPerWeek: subject.periodsPerWeek, teacher: teachers.get(String(TimetableService.teacherOf(subject, section._id))) ?? null }));
  }

  /** School: the weekly timetable of the student's section. */
  static async timetable({ student }: PortalContext) {
    const { batches } = await this.groups(student);
    return batches[0] ? TimetableService.list({ adminId: student.adminId }, { batchCode: batches[0].batchCode }) : [];
  }

  static async attendance({ student }: PortalContext, month: unknown) {
    return AttendanceService.getStudentHistory({ adminId: student.adminId }, student.studentCode, month);
  }

  static async fees({ student }: PortalContext) {
    const [fees, submissions, paymentDetails] = await Promise.all([
      FeeService.getStudentFees({ adminId: student.adminId }, student.studentCode),
      FeeSubmissionService.forStudent(student),
      FeeSubmissionService.getSettings(student.adminId),
    ]);
    return { fees, submissions, paymentDetails };
  }

  static async submitFee({ student, user }: PortalContext, input: Record<string, any>) {
    return FeeSubmissionService.submit(student, user, input);
  }

  /** Tests / exams the student sits: the class or chosen sections (school), the batch (coaching). */
  private static async myTests(student: Record<string, any>, filter: Record<string, any> = {}) {
    const { batches, courseIds } = await this.groups(student);
    const batchIds = batches.map(batch => String(batch._id));
    const tests = await Test.find({ adminId: student.adminId, workType: student.workType, cancelled: false, ...filter }).lean();
    return tests.filter(test => test.batchIds.length
      ? test.batchIds.some(id => batchIds.includes(String(id)))
      : student.workType === "school" && courseIds.has(String(test.courseId)));
  }

  static async tests({ student }: PortalContext) {
    const tests = await this.myTests(student);
    const today = todayKey();
    return tests.map(test => ({
      testCode: test.testCode, name: test.name, term: test.term, status: TestService.statusOf(test), resultsPublished: test.resultsPublished,
      papers: [...test.papers].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        // A paper is upcoming until its day has passed, unless its results are already out.
        .map(paper => ({ subject: paper.subject, date: paper.date, maxMarks: paper.maxMarks, upcoming: dayKey(paper.date) >= today && !test.resultsPublished })),
    })).sort((a, b) => new Date(a.papers[0]?.date ?? 0).getTime() - new Date(b.papers[0]?.date ?? 0).getTime());
  }

  /** Published results only: marks, percentage, grade and rank among everyone who sat the paper. */
  static async results({ student }: PortalContext) {
    const tests = await this.myTests(student, { resultsPublished: true });
    if (!tests.length) return [];
    const marks = await TestMark.find({ testId: { $in: tests.map(test => test._id) } }).lean();
    return tests.flatMap(test => test.papers.map(paper => {
      const paperMarks = marks.filter(mark => same(mark.testId, test._id) && same(mark.paperId, paper._id));
      const mine = paperMarks.find(mark => same(mark.studentId, student._id));
      if (!mine || (mine.marks === null && !mine.absent)) return null;
      const scored = paperMarks.filter(mark => !mark.absent && mark.marks !== null);
      const percentage = mine.absent ? 0 : Math.round(((mine.marks ?? 0) / paper.maxMarks) * 1000) / 10;
      return {
        testCode: test.testCode, exam: test.name, term: test.term, subject: paper.subject, date: paper.date, marks: mine.marks, maxMarks: paper.maxMarks,
        absent: mine.absent, percentage, grade: mine.absent ? "AB" : gradeFor(percentage, test.workType), remarks: mine.remarks,
        rank: mine.absent ? null : 1 + scored.filter(mark => (mark.marks ?? 0) > (mine.marks ?? 0)).length, outOf: scored.length,
      };
    }).filter(Boolean)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  /** Published materials for the student's course / class and sections / batches. */
  static async materials({ student }: PortalContext) {
    const { batches, courseIds } = await this.groups(student);
    const batchIds = batches.map(batch => String(batch._id));
    const materials = await Material.find({ adminId: student.adminId, status: "published", courseId: { $in: [...courseIds] } }).sort({ publishedAt: -1, createdAt: -1 }).lean();
    return materials.filter(material => !material.batchIds.length || material.batchIds.some(id => batchIds.includes(String(id))))
      .map(material => ({ materialCode: material.materialCode, title: material.title, description: material.description, subject: material.subject, type: material.type, file: material.file, link: material.link, date: material.publishedAt ?? material.createdAt }));
  }

  /** Live notices for everyone or for students, aimed at the student's course and sections / batches. Pinned first. */
  static async notices({ student }: PortalContext) {
    const { batches, courseIds } = await this.groups(student);
    const batchIds = batches.map(batch => String(batch._id));
    const notices = await Notice.find({ adminId: student.adminId, status: "published", audience: { $in: ["everyone", "students"] } }).lean();
    return notices
      .filter(notice => noticeState(notice) === "live" && (!notice.courseId || courseIds.has(String(notice.courseId))) && (!notice.batchIds.length || notice.batchIds.some(id => batchIds.includes(String(id)))))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime())
      .map(notice => ({ noticeCode: notice.noticeCode, title: notice.title, description: notice.description, type: notice.type, date: notice.publishDate, pinned: notice.pinned }));
  }

  /** Parent "Updates": published posts and upcoming events, newest first. */
  static async updates({ student }: PortalContext) {
    const today = todayKey();
    const [posts, events] = await Promise.all([
      Post.find({ adminId: student.adminId, status: "published" }).sort({ publishDate: -1 }).limit(30).lean(),
      SchoolEvent.find({ adminId: student.adminId, cancelled: false }).lean(),
    ]);
    return [
      ...posts.filter(post => dayKey(post.publishDate) <= today).map(post => ({ kind: "post", title: post.title, body: post.description, date: post.publishDate, imageUrl: post.imageUrl, link: post.videoLink })),
      ...events.filter(event => EventService.statusOf(event) === "upcoming" && ["all", "students", "parents"].includes(event.audience))
        .map(event => ({ kind: "event", title: event.name, body: [event.venue, event.description].filter(Boolean).join(" · "), date: event.date, startTime: event.startTime, imageUrl: null, link: null })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  /** Syllabus covered in each subject of the student's section / batch. */
  static async syllabus({ student }: PortalContext) {
    return SyllabusService.forStudent(student);
  }

  static async tasks({ student }: PortalContext) {
    return TaskService.forStudent(student);
  }

  static async submitTask({ student }: PortalContext, taskCode: string, file: { url: string; name: string }) {
    return TaskService.submit(student, taskCode, file);
  }
}
