import FeeModel from "../../model/fee/fee.js";
import AttendanceModel from "../../model/attendance/attendance.js";
import Admission from "../../model/admission/admission.js";
import StudentDetailsModel from "../../model/students/studentInfo.js";
import Test, { TestMark } from "../../model/test/test.js";
import Course from "../../model/teacher/courseModel.js";
import Batch from "../../model/teacher/batchModel.js";
import Teacher from "../../model/teacher/teacherInfo.js";
import Post from "../../model/post/post.js";
import Notice from "../../model/notice/notice.js";
import { BatchService } from "../teacher/batchServices.js";
import { TestService } from "../test/test.js";
import { parseDay, studentPlacement, todayKey } from "../../utilis/ownerScope.js";
import { StaffActor, teacherBatchIds } from "../../utilis/staffAccess.js";
import { noticeState } from "../notice/notice.js";
import { TimetableService } from "../timetable/timetable.js";

const DAY = 86400000;
const dayKey = (date: Date | string) => new Date(date).toISOString().slice(0, 10);
const pct = (part: number, whole: number) => whole ? Math.round((part / whole) * 1000) / 10 : 0;
const short = (date: Date | string) => new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const minutes = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
const clock = (time: string) => { const [h, m] = time.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase();
/** School stages for the Classes panel. */
const STAGES = [
  { name: "Pre-primary", classes: ["Nursery", "LKG", "UKG"], icon: "child_care", tone: "dept-aqua" },
  { name: "Primary", classes: ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5"], icon: "menu_book", tone: "dept-violet" },
  { name: "Middle school", classes: ["Class 6", "Class 7", "Class 8"], icon: "science", tone: "dept-orange" },
  { name: "Secondary & senior secondary", classes: ["Class 9", "Class 10", "Class 11", "Class 12"], icon: "school", tone: "dept-blue" },
];

export class DashboardService {

  /** Owner home: today's numbers, money, admissions, upcoming tests and notices (shape follows the panel's dashboard). */
  static async owner(scope: { adminId: unknown; workType: "school" | "coaching" }) {
    const today = parseDay(todayKey());
    const tomorrow = new Date(today.getTime() + DAY);
    const monthStart = parseDay(`${todayKey().slice(0, 7)}-01`);
    const weekStart = new Date(today.getTime() - 6 * DAY);
    const base = { adminId: scope.adminId, workType: scope.workType };
    const [students, fees, attendance, enquiries, teachers, tests, posts, notices, courses, batches] = await Promise.all([
      StudentDetailsModel.find(base).select("studentCode fullName workType coachingInfo schoolInfo createdAt").lean(),
      FeeModel.find(base).populate("student", "studentCode fullName").lean(),
      AttendanceModel.find({ ...base, date: { $gte: weekStart, $lt: tomorrow } }).select("student date status").lean(),
      Admission.find({ adminId: scope.adminId }).select("status followUpDate enquiryDate").lean(),
      Teacher.countDocuments({ adminId: scope.adminId }),
      Test.find({ ...base, cancelled: false }).lean(),
      Post.find({ adminId: scope.adminId, status: "published" }).sort({ publishDate: -1 }).limit(2).lean(),
      Notice.find({ adminId: scope.adminId, status: "published" }).sort({ publishDate: 1 }).lean(),
      Course.find({ adminId: scope.adminId, status: "active" }).select("name").lean(),
      Batch.find({ adminId: scope.adminId, status: "active" }).select("courseId name").lean(),
    ]);
    const byStudent = new Map(students.map(student => [String(student._id), student]));

    // Attendance: today, by batch / section, and the last seven days.
    const todays = attendance.filter(record => dayKey(record.date) === todayKey());
    const came = (status: string) => status === "present" || status === "late";
    const groups = new Map<string, { present: number; total: number }>();
    todays.forEach(record => {
      const student = byStudent.get(String(record.student));
      const { course, batch } = studentPlacement(student);
      const name = scope.workType === "school" ? `${course} · ${batch}` : batch !== "—" ? batch : course;
      const row = groups.get(name) ?? { present: 0, total: 0 };
      row.total++; if (came(record.status)) row.present++; groups.set(name, row);
    });
    const week = Array.from({ length: 7 }, (_, index) => {
      const key = dayKey(new Date(weekStart.getTime() + index * DAY));
      const rows = attendance.filter(record => dayKey(record.date) === key);
      const present = rows.filter(record => came(record.status)).length;
      return { day: DAYS[new Date(`${key}T00:00:00Z`).getUTCDay()], present: pct(present, rows.length), absent: rows.length ? Math.round((100 - pct(present, rows.length)) * 10) / 10 : 0, marked: rows.length };
    });

    // Fees: today, this month in five-day buckets, and what is still due.
    let todayCollection = 0, monthCollection = 0;
    const buckets = [0, 0, 0, 0, 0, 0];
    const pendingRows: { name: string; detail: string; amount: number }[] = [];
    let pendingTotal = 0;
    const pendingStudents = new Set<string>();
    for (const fee of fees) {
      for (const payment of fee.payments || []) {
        const key = dayKey(payment.paidOn);
        if (key === todayKey()) todayCollection += payment.amount;
        if (key.slice(0, 7) === todayKey().slice(0, 7)) { monthCollection += payment.amount; buckets[Math.min(5, Math.floor((Number(key.slice(8)) - 1) / 5))] += payment.amount; }
      }
      const balance = Math.max(0, fee.totalFee - (fee.discount || 0) - (fee.paidAmount || 0));
      if (balance > 0 && (!fee.dueDate || new Date(fee.dueDate) < tomorrow)) {
        const student: any = fee.student;
        pendingTotal += balance; pendingStudents.add(String(student?._id ?? fee.student));
        pendingRows.push({ name: student?.fullName ?? "Student", detail: `${fee.period} · ${student?.studentCode ?? ""}`, amount: balance });
      }
    }
    const bucketMax = Math.max(1, ...buckets);

    // Tests / exams: papers from today on.
    const upcoming = tests.flatMap(test => test.papers.filter(paper => dayKey(paper.date) >= todayKey()).map(paper => ({ test, paper })))
      .sort((a, b) => new Date(a.paper.date).getTime() - new Date(b.paper.date).getTime()).slice(0, 4);
    const courseName = new Map(courses.map(course => [String(course._id), course.name]));

    const newStudents = students.filter(student => new Date(student.createdAt) >= monthStart);
    const live = notices.filter(notice => noticeState(notice) === "live" || noticeState(notice) === "scheduled");
    const upcomingNotices = live.filter(notice => !notice.expiryDate || dayKey(notice.expiryDate) >= todayKey()).slice(0, 3);
    const stageCounts = STAGES.map(stage => {
      const inStage = students.filter(student => stage.classes.some(name => new RegExp(`(^|,)\\s*${name}\\s*(,|$)`, "i").test(String(student.schoolInfo?.className ?? ""))));
      const sections = batches.filter(batch => stage.classes.includes(courseName.get(String(batch.courseId)) ?? "")).length;
      return { name: stage.name, icon: stage.icon, tone: stage.tone, detail: `${stage.classes[0]} – ${stage.classes[stage.classes.length - 1]} · ${inStage.length} students · ${sections} section${sections === 1 ? "" : "s"}` };
    });

    return {
      workType: scope.workType,
      students: { total: students.length, newThisMonth: newStudents.length },
      teachers,
      classes: { courses: courses.length, batches: batches.length },
      attendanceToday: { marked: todays.length, present: todays.filter(record => came(record.status)).length, percent: pct(todays.filter(record => came(record.status)).length, todays.length) },
      fees: { today: todayCollection, month: monthCollection, pending: pendingTotal, pendingStudents: pendingStudents.size, monthRate: pct(monthCollection, monthCollection + pendingTotal) },
      enquiries: { new: enquiries.filter(item => item.status === "new").length, followUpsDue: enquiries.filter(item => ["new", "contacted", "interested"].includes(item.status) && item.followUpDate && dayKey(item.followUpDate) <= todayKey()).length, thisMonth: enquiries.filter(item => new Date(item.enquiryDate) >= monthStart).length },
      recentAdmissions: [...students].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3).map(student => {
        const { course } = studentPlacement(student);
        return { name: student.fullName || "Student", course, time: short(student.createdAt), initials: initials(student.fullName || "S") };
      }),
      pendingFees: pendingRows.sort((a, b) => b.amount - a.amount).slice(0, 3),
      attendanceByGroup: [...groups.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 3).map(([name, row]) => ({ name, ...row })),
      attendanceWeek: week,
      feeBuckets: ["1–5", "6–10", "11–15", "16–20", "21–25", "26–31"].map((day, index) => ({ day, amount: buckets[index], height: Math.round((buckets[index] / bucketMax) * 90) })),
      upcomingTests: upcoming.map(({ test, paper }) => ({
        date: short(paper.date), title: test.term ? `${test.name} · ${paper.subject}` : `${test.name} · ${paper.subject}`,
        detail: `${courseName.get(String(test.courseId)) ?? ""} · ${paper.maxMarks} marks`, status: dayKey(paper.date) === todayKey() ? "Today" : "Upcoming",
      })),
      recentPosts: posts.map(post => ({ title: post.title, date: short(post.publishDate), type: post.type })),
      notices: upcomingNotices.map(notice => ({ day: new Date(notice.publishDate).getUTCDate().toString().padStart(2, "0"), month: new Date(notice.publishDate).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }).toUpperCase(), title: notice.title, detail: notice.description.slice(0, 80) })),
      schoolStages: scope.workType === "school" ? stageCounts : [],
    };
  }

  /** "In progress" / "Done" / "Later" for a slot today; the first later one becomes "Up next". */
  private static timeState(items: { start: string; end: string; status: string; tone: string }[]) {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    items.forEach(item => {
      const state = nowMinutes >= minutes(item.end) ? ["Done", "neutral"] : nowMinutes >= minutes(item.start) ? ["In progress", "success"] : ["Later", "neutral"];
      item.status = state[0]; item.tone = state[1];
    });
    const next = items.find(item => item.status === "Later");
    if (next) Object.assign(next, { status: "Up next", tone: "info" });
  }

  /** School teachers: today's periods come from the timetable and their classes from Subjects (plus sections they class-teach). */
  private static async schoolTeacher(actor: StaffActor) {
    const periods = await TimetableService.today(actor);
    const today = periods.map((period, index) => ({
      time: period.startTime, start: period.startTime, end: period.endTime, status: "", tone: "",
      title: `Period ${index + 1} · ${period.subject}`,
      detail: `${period.group}${period.room ? ` · Room ${period.room}` : ""} · ${clock(period.startTime)} – ${clock(period.endTime)}`,
    }));
    this.timeState(today);
    const groups = (await TimetableService.myClasses(actor)).map(row => ({
      time: String(row.students), title: row.group,
      detail: [row.classTeacher ? "Class teacher" : "", row.subjects.join(", ")].filter(Boolean).join(" · ") || "—",
      status: row.classTeacher ? "Class teacher" : "Subject teacher", tone: row.classTeacher ? "success" : "info",
    }));
    return { today: today.map(({ start, end, ...item }) => item), groups };
  }

  /** Teacher "My dashboard": today's classes, my classes / batches and tests waiting for marks. */
  static async teacher(actor: StaffActor, name: string | null) {
    const work = await this.marksDue(actor);
    if (actor.workType === "school") return { name: name || "Teacher", ...await this.schoolTeacher(actor), work };
    const myBatchIds = await teacherBatchIds(actor);
    const batches = await Batch.find({ _id: { $in: myBatchIds }, status: "active" }).lean();
    const courses = await Course.find({ _id: { $in: batches.map(batch => batch.courseId) } }).select("name").lean();
    const courseName = new Map(courses.map(course => [String(course._id), course.name]));
    const students = await StudentDetailsModel.find({ adminId: actor.adminId, workType: actor.workType }).select("coachingInfo.batchTiming schoolInfo.className schoolInfo.section").lean();
    const studentCount = (batch: Record<string, any>) => students.filter(student => BatchService.studentInBatch(student, batch, courseName.get(String(batch.courseId)))).length;
    const todayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];

    // Coaching: batches meeting today, from their days and timing.
    const slots = batches.filter(batch => batch.days.includes(todayName as any) && batch.startTime && batch.endTime)
      .sort((a, b) => minutes(a.startTime!) - minutes(b.startTime!))
      .map(batch => ({
        time: batch.startTime!, start: batch.startTime!, end: batch.endTime!, status: "", tone: "", title: batch.name,
        detail: `${courseName.get(String(batch.courseId)) ?? ""}${batch.room ? ` · ${batch.room}` : ""} · ${clock(batch.startTime!)} – ${clock(batch.endTime!)}`,
      }));
    this.timeState(slots);
    const today = slots.map(({ start, end, ...item }) => item);

    const groups = batches.map(batch => ({
      time: String(studentCount(batch)), title: batch.name,
      detail: `${courseName.get(String(batch.courseId)) ?? ""} · ${batch.days.join(", ")}${batch.startTime ? ` · ${clock(batch.startTime)}` : ""}`,
      status: "Active", tone: "success",
    }));

    return { name: name || "Teacher", today, groups, work };
  }

  /** Tests whose papers are held but still missing marks this teacher can enter. */
  private static async marksDue(actor: StaffActor) {
    const tests = (await TestService.getAllTests(actor)).filter(test => !test.resultsPublished && !test.cancelled);
    return tests.flatMap(test => test.papers.filter(paper => paper.canEnterMarks && dayKey(paper.date) <= todayKey() && paper.entered < test.students).map(paper => ({
      time: String(test.students - paper.entered), title: `${test.name} · ${paper.subject}`,
      detail: `${test.course?.name ?? ""}${test.batches.length ? ` · ${test.batches.map(batch => batch.name).join(", ")}` : ""} · ${paper.entered} of ${test.students} entered`,
      status: "Marks due", tone: "warning",
    }))).slice(0, 5);
  }
}
