import fs from "node:fs";
import path from "node:path";
import { randomInt, randomUUID } from "node:crypto";
import AuthModel from "../../model/Auth/auth.js";
import Teacher from "../../model/teacher/teacherInfo.js";
import Course from "../../model/teacher/courseModel.js";
import Batch from "../../model/teacher/batchModel.js";
import StudentDetailsModel from "../../model/students/studentInfo.js";
import { CourseService, SCHOOL_CLASSES } from "../teacher/courseServices.js";
import { BatchService } from "../teacher/batchServices.js";
import { TeacherInfoService } from "../teacher/teacherInfo.js";
import { StudentInfoService } from "../student/studentInfo.js";
import { SessionService } from "../session/session.js";
import { SubjectService } from "../subject/subject.js";
import { TimetableService } from "../timetable/timetable.js";
import { EventService } from "../event/event.js";
import { FeeService } from "../fee/fee.js";
import { FeeSubmissionService } from "../fee/feeSubmission.js";
import { AttendanceService } from "../attendance/attendance.js";
import { NoticeService } from "../notice/notice.js";
import { TestService } from "../test/test.js";
import { TaskService } from "../task/task.js";
import { MaterialService } from "../material/material.js";
import { PostService } from "../post/post.js";
import { GalleryService } from "../gallery/gallery.js";
import { LibraryService } from "../library/library.js";
import { AdmissionService } from "../admission/admission.js";
import { SyllabusService } from "../syllabus/syllabus.js";
import { UPLOAD_ROOT } from "../../utilis/storedFiles.js";
import { escapeRegex } from "../../utilis/ownerScope.js";
import type { StaffActor } from "../../utilis/staffAccess.js";

const ASSETS = path.resolve(process.cwd(), "sample-assets");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** YYYY-MM-DD `days` from today (local time). */
const dayFromToday = (days: number) => {
  const date = new Date(Date.now() + days * 86400000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
/** The last `count` days up to today, skipping Sundays. */
const recentSchoolDays = (count: number) => {
  const days: string[] = [];
  for (let back = 0; days.length < count && back < 30; back++) if (new Date(Date.now() - back * 86400000).getDay() !== 0) days.push(dayFromToday(-back));
  return days.reverse();
};

/** A 10-digit mobile no other account uses. */
const freeMobile = async () => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const phone = `9${randomInt(100000000, 1000000000)}`;
    if (!(await AuthModel.exists({ phoneNumber: phone, isDeleted: false }))) return phone;
  }
  throw new Error("No free mobile number for sample data");
};

/** Copies a bundled sample photo into the owner's uploads, as if it had been uploaded, and returns its URL. */
const storeSampleFile = (file: string, folder: "media" | "portal", adminId: unknown, baseUrl: string) => {
  const dir = path.join(UPLOAD_ROOT, folder, String(adminId));
  fs.mkdirSync(dir, { recursive: true });
  const name = `${randomUUID()}${path.extname(file)}`;
  fs.copyFileSync(path.join(ASSETS, file), path.join(dir, name));
  return `${baseUrl.replace(/\/$/, "")}/uploads/${folder}/${adminId}/${name}`;
};

export type SampleOwner = { _id: unknown; fullName?: string | null; workType: "school" | "coaching" };
export type SampleResult = { done: string[]; skipped: string[] };

/**
 * One clearly marked sample in every module and panel for an owner, so nothing starts empty: the owner's pages, the
 * sample teacher's panel, the sample student's portal and the sample parent's portal. Everything goes through the
 * normal services (same rules as the panel) and can be edited or deleted. Sample logins get a random password, so
 * nobody can sign in until the owner sets one (Teachers page / Student form, incl. the parent login).
 * A step that fails is logged and skipped; it never stops the owner's account.
 */
export class SampleDataService {

  /** True when this owner already has the sample teacher, so seeding twice is skipped. */
  static async hasSamples(adminId: unknown) {
    return !!(await Teacher.exists({ adminId, email: /^sample\.teacher\./ }));
  }

  static async seed(owner: SampleOwner, { baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:4000" }: { baseUrl?: string } = {}): Promise<SampleResult> {
    const done: string[] = [];
    const skipped: string[] = [];
    const step = async <T>(label: string, run: () => Promise<T>): Promise<T | null> => {
      try { const result = await run(); done.push(label); return result; }
      catch (error) { skipped.push(`${label}: ${error.message}`); console.error(`Sample data (${label}) skipped:`, error.message); return null; }
    };
    const { workType } = owner;
    const adminId = owner._id;
    const school = workType === "school";
    const actor: StaffActor = { role: "admin", userId: adminId, adminId, workType, teacher: null };
    const scope = { adminId, workType };
    const tag = `${String(adminId).slice(-6)}${randomInt(100, 1000)}`;
    const now = new Date();
    const feePeriod = school ? "Term 1" : `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
    const feeTotal = school ? 18500 : 1500;
    const room = "Room S1";

    // Names the owner already uses stay free: the sample takes the next free class / course / batch name.
    const taken = (await Course.find({ adminId }).select("name").lean()).map(course => course.name.toLowerCase());
    const className = school ? ["Class 9", ...SCHOOL_CLASSES.filter(name => name !== "Class 9")].find(name => !taken.includes(name.toLowerCase())) : taken.includes("mathematics") ? "Mathematics (Sample)" : "Mathematics";
    if (!className) return { done, skipped: ["every school class name is already used"] };
    const batchName = school ? "Section A" : (await Batch.exists({ adminId, name: new RegExp(`^${escapeRegex("Maths · Morning")}$`, "i") })) ? "Maths · Morning (Sample)" : "Maths · Morning";

    // ---- People and structure ----
    const teacher = await step("teacher", async () => TeacherInfoService.createTeacher({
      fullName: "Priya Sharma (Sample)", email: `sample.teacher.${tag}@example.com`, countryCode: "+91", phoneNumber: await freeMobile(),
      password: randomUUID(), status: "active", joiningDate: dayFromToday(-60), gender: "female",
      ...(school
        ? { schoolInfo: { designation: "TGT", department: "Secondary", qualification: ["B.Ed", "M.Sc / M.A. / M.Com"], subjects: ["Mathematics"], classesTaught: [className] } }
        : { coachingInfo: { qualification: ["B.Ed"], experience: 5, subjects: ["Mathematics", "Physics"], classesTaught: [] } }),
    }, workType, adminId));
    const teacherCode: string | undefined = teacher?.id;
    // Homework, assignments and materials are given by the sample teacher, so they also show in the teacher's panel.
    const teacherActor: StaffActor = teacher
      ? { role: "teacher", userId: teacher.user._id, adminId, workType, teacher: { _id: teacher.teacher._id, subjects: school ? ["Mathematics"] : ["Mathematics", "Physics"] } }
      : actor;

    const course = await step(school ? "class" : "course", () => CourseService.createCourse({
      name: className, description: school ? "Sample class – edit or delete it." : "Sample course – edit or delete it.",
      duration: school ? "April – March" : "12 months", feeAmount: feeTotal, feeFrequency: school ? "perTerm" : "monthly", subjects: ["Mathematics"], status: "active",
    }, workType, adminId));
    if (!course) return { done, skipped };

    const batch = await step(school ? "section" : "batch", () => BatchService.createBatch(school
      ? { courseCode: course.courseCode, name: batchName, teacherCodes: teacherCode ? [teacherCode] : [], room, capacity: 40, status: "active" }
      : { courseCode: course.courseCode, name: batchName, teacherCodes: teacherCode ? [teacherCode] : [], days: WEEK, startTime: "07:00", endTime: "08:30", startDate: dayFromToday(-60), room, capacity: 30, status: "active" },
      workType, adminId));

    const created = await step("student + parent login", async () => StudentInfoService.createStudent({
      fullName: "Aarav Verma (Sample)", email: `sample.student.${tag}@example.com`, countryCode: "+91", phoneNumber: await freeMobile(),
      password: randomUUID(), gender: "male", dateOfBirth: school ? "2011-06-15" : "2010-03-20", status: "active",
      feePlan: { amount: feeTotal, discount: 0 },
      parentsInfo: { fatherName: "Rakesh Verma (Sample)", motherName: "Sunita Verma", countryCode: "+91", phoneNumber: await freeMobile() },
      address: { addressLine: "12 Civil Lines", city: "Lucknow", state: "Uttar Pradesh", pincode: "226001" },
      parentLogin: { enabled: true, password: randomUUID() },
      ...(school
        ? { schoolInfo: { schoolName: null, className, section: batchName, admissionDate: dayFromToday(-60), rollNumber: "1", currentTerm: "Term 1", admissionCategory: "General" } }
        : { coachingInfo: { coachingName: null, className, course: className, batchTiming: batchName, admissionDate: dayFromToday(-60), schoolName: "City Inter College", board: "UP Board" } }),
    }, workType, adminId));
    const studentCode: string | undefined = created?.id;
    const student = studentCode ? await StudentDetailsModel.findOne({ adminId, studentCode }).lean() : null;

    // ---- School structure: session, subject (teacher per section), a period every weekday, an event ----
    if (school) {
      const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      await step("academic session", () => SessionService.create({ name: `${startYear}–${String(startYear + 1).slice(-2)}`, startDate: `${startYear}-04-01`, endDate: `${startYear + 1}-03-31`, terms: ["Term 1", "Term 2"], status: "current" }, workType, adminId));
      const subject = batch && await step("subject", () => SubjectService.create({ courseCode: course.courseCode, name: "Mathematics", code: "MATH", periodsPerWeek: 6, sections: [{ batchCode: batch.batchCode, teacherCode: teacherCode ?? null }], status: "active" }, workType, adminId));
      if (batch && subject) await step("timetable", async () => {
        for (const day of WEEK) await TimetableService.create({ batchCode: batch.batchCode, subjectCode: subject.subjectCode, day, startTime: "08:00", endTime: "08:40", room: null }, workType, adminId);
      });
      await step("event", () => EventService.create({ name: "Annual Sports Day (Sample)", date: dayFromToday(14), startTime: "09:00", venue: "School ground", audience: "all", description: "Sample event – edit or delete it.", cancelled: false }, workType, adminId));
    }

    // ---- Daily work: attendance and fees ----
    if (studentCode) {
      const statuses = ["present", "present", "late", "present", "absent", "present"];
      await step("attendance", async () => {
        for (const [index, date] of recentSchoolDays(statuses.length).entries()) await AttendanceService.markAttendance(scope, adminId, { date, records: [{ studentId: studentCode, status: statuses[index] as any }] });
      });
      await step("fee", () => FeeService.createFee(scope, { studentIds: [studentCode], period: feePeriod, totalFee: feeTotal, dueDate: dayFromToday(10), note: "Sample fee – edit or delete it." }));
      await step("fee payment + receipt", () => FeeService.collectFee(scope, adminId, { studentIds: [studentCode], period: feePeriod, amount: Math.round(feeTotal / 2), mode: "UPI", date: dayFromToday(-3), reference: "UPISAMPLE01", note: "Sample payment" }));
      if (student?.parentId) await step("parent payment to verify", async () => FeeSubmissionService.submit(student, await AuthModel.findById(student.parentId).lean(), {
        period: feePeriod, amount: school ? 2000 : 250, mode: "UPI", reference: "UTRSAMPLE123", proof: null, note: "Sample payment from the parent – approve or reject it.",
      }));
    }

    // ---- Communication ----
    await step("notice", () => NoticeService.createNotice({ title: "Welcome to EduNexa (Sample notice)", description: "This is a sample notice. Edit or delete it and post your own notices for students, parents and teachers.", type: "general", audience: "everyone", batchCodes: [], pinned: true, showOnWebsite: false, status: "published" }, actor));
    await step("post with photo", () => PostService.createPost({
      title: school ? "Admissions open (Sample post)" : "New batches starting (Sample post)", description: "This is a sample post. Share news, results and photos with your students and parents.",
      type: "image", imageUrl: storeSampleFile(school ? "school-building.jpg" : "coaching-batch.jpg", "media", adminId, baseUrl), pinned: false, showOnWebsite: false, status: "published",
    }, actor, owner.fullName ?? null));
    await step("gallery album with photos", async () => {
      const album = await GalleryService.createAlbum({ name: school ? "School life (Sample)" : "Classroom moments (Sample)", description: "Sample album – add photos or delete it.", date: dayFromToday(-7), showOnWebsite: false, status: "published" }, actor);
      const files = school ? ["school-life.jpg", "independence-day.jpg"] : ["coaching-class.jpg", "campus-life.jpg"];
      await GalleryService.addItems(album.albumCode, files.map(file => ({ kind: "image", url: storeSampleFile(file, "media", adminId, baseUrl), caption: null })), actor);
    });

    // ---- Assessment: an upcoming exam / test, and a past one with published results ----
    if (batch) {
      await step(school ? "upcoming exam" : "upcoming test", () => TestService.createTest(school
        ? { name: "Unit Test 2 (Sample)", term: "Term 1", courseCode: course.courseCode, batchCodes: [batch.batchCode], papers: [{ subject: "Mathematics", date: dayFromToday(10), maxMarks: 40, passMarks: null }] }
        : { name: "Weekly Test 2 (Sample)", term: null, courseCode: null, batchCodes: [batch.batchCode], papers: [{ subject: "Mathematics", date: dayFromToday(10), maxMarks: 50, passMarks: null }] }, actor));
      if (studentCode) await step("published result", async () => {
        const test = await TestService.createTest(school
          ? { name: "Unit Test 1 (Sample)", term: "Term 1", courseCode: course.courseCode, batchCodes: [batch.batchCode], papers: [{ subject: "Mathematics", date: dayFromToday(-5), maxMarks: 40, passMarks: null }] }
          : { name: "Weekly Test 1 (Sample)", term: null, courseCode: null, batchCodes: [batch.batchCode], papers: [{ subject: "Mathematics", date: dayFromToday(-5), maxMarks: 50, passMarks: null }] }, actor);
        await TestService.saveMarks(test.testCode, { paperId: test.papers[0].paperId, entries: [{ studentCode, marks: school ? 34 : 42, absent: false, remarks: "Good work" }] }, actor);
        await TestService.setPublished(test.testCode, true, actor);
      });

      // ---- Homework / assignment (the student has submitted it) and study material ----
      const assignment = await step("assignment", () => TaskService.create({ kind: "assignment", title: "Algebra practice sheet (Sample)", batchCode: batch.batchCode, subject: "Mathematics", dueDate: dayFromToday(7), description: "Sample assignment – edit or delete it.", attachment: null, status: "assigned" }, teacherActor));
      if (assignment && student) await step("assignment submission", () => TaskService.submit(student, assignment.taskCode, { url: storeSampleFile("school-life.jpg", "portal", adminId, baseUrl), name: "my-algebra-work.jpg" }));
      await step("homework", () => TaskService.create({ kind: "homework", title: "Exercise 1.1, Q1–5 (Sample)", batchCode: batch.batchCode, subject: "Mathematics", dueDate: dayFromToday(2), description: null, attachment: null, status: "assigned" }, teacherActor));
    }
    await step("study material", () => MaterialService.createMaterial({ title: "Number systems – chapter notes (Sample)", description: "Sample study material – edit or delete it.", courseCode: course.courseCode, batchCodes: batch ? [batch.batchCode] : [], subject: "Mathematics", type: "notes", link: "https://ncert.nic.in/textbook.php", status: "published" }, teacherActor));

    // ---- Library (a book on loan to the student) and an admission enquiry ----
    const book = await step("library book", () => LibraryService.createBook({ title: "NCERT Mathematics (Sample)", author: "NCERT", category: "Textbook", shelf: "A-1", copies: 2 }, scope));
    if (book && studentCode) await step("library loan", () => LibraryService.issue({ bookCode: book.bookCode, memberType: "student", memberCode: studentCode }, scope, adminId));
    await step("admission enquiry", () => AdmissionService.createEnquiry({ studentName: "Ananya Gupta (Sample)", parentName: "Manoj Gupta", countryCode: "+91", phoneNumber: "9876500000", email: null, className, message: "Sample enquiry – edit or delete it.", source: "walkIn", status: "new" }, workType, adminId));

    // ---- Syllabus: chapters with target months, four ticked for the sample section / batch ----
    if (batch) await step("syllabus progress", async () => {
      const chapters = school
        ? ["Number Systems", "Polynomials", "Coordinate Geometry", "Linear Equations in Two Variables", "Introduction to Euclid's Geometry", "Lines and Angles", "Triangles", "Quadrilaterals", "Circles", "Heron's Formula", "Surface Areas and Volumes", "Statistics"]
        : ["Number System", "Fractions and Decimals", "Percentage", "Ratio and Proportion", "Profit and Loss", "Simple Interest", "Time and Work", "Speed, Distance and Time", "Mensuration", "Algebra Basics"];
      // Targets run month by month from three months ago, so a few are already due.
      const month = (offset: number) => { const date = new Date(now.getFullYear(), now.getMonth() + offset, 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; };
      const syllabus = await SyllabusService.create({ courseCode: course.courseCode, subject: "Mathematics", chapters: chapters.map((title, index) => ({ title, targetMonth: month(Math.floor(index / 2) - 3), weight: 1 })) }, actor);
      for (const [index, chapter] of syllabus.chapters.slice(0, 4).entries()) {
        await SyllabusService.mark(syllabus.syllabusCode, { batchCode: batch.batchCode, chapterId: chapter.chapterId, done: true, completedOn: dayFromToday(-60 + index * 14) }, actor);
      }
    });

    return { done, skipped };
  }
}
