import HttpStatus from "http-status-codes";
import FeeModel from "../../model/fee/fee.js";
import AttendanceModel from "../../model/attendance/attendance.js";
import Admission from "../../model/admission/admission.js";
import StudentDetailsModel from "../../model/students/studentInfo.js";
import Test, { TestMark } from "../../model/test/test.js";
import Course from "../../model/teacher/courseModel.js";
import { gradeFor } from "../test/test.js";
import { parseDay, studentPlacement, todayKey } from "../../utilis/ownerScope.js";

const statusError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const DAY = 86400000;
const dayKey = (date: Date | string) => new Date(date).toISOString().slice(0, 10);
const rupees = (value: number) => Math.round(value);
const pct = (part: number, whole: number) => whole ? Math.round((part / whole) * 1000) / 10 : 0;
const monthLabel = (key: string) => new Date(`${key}-01T00:00:00.000Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

export type ReportScope = { adminId: unknown; workType: "school" | "coaching" };
export type ReportType = "fees" | "attendance" | "admissions" | "academic";
export const reportTypes: ReportType[] = ["fees", "attendance", "admissions", "academic"];

/** A report is summary figures plus tables, so the panel can show and export every report the same way. */
export interface ReportColumn { key: string; label: string; type?: "text" | "number" | "money" | "percent" | "date"; }
export interface ReportTable { key: string; title: string; columns: ReportColumn[]; rows: Record<string, unknown>[]; }
export interface Report { type: ReportType; from: string; to: string; summary: { label: string; value: string | number; hint?: string }[]; tables: ReportTable[]; }

/** [from, to] inclusive as UTC days; defaults to the current month. */
export const reportRange = (from?: unknown, to?: unknown) => {
  const today = todayKey();
  const start = from ? parseDay(from, "from date") : parseDay(`${today.slice(0, 7)}-01`);
  const end = to ? parseDay(to, "to date") : parseDay(today);
  if (end < start) throw statusError("“To” date must be on or after the “from” date", HttpStatus.BAD_REQUEST);
  if (end.getTime() - start.getTime() > 366 * 2 * DAY) throw statusError("Choose a range of up to two years", HttpStatus.BAD_REQUEST);
  return { start, end, endExclusive: new Date(end.getTime() + DAY) };
};

const placementLabel = (student: Record<string, any>) => {
  const { course, batch } = studentPlacement(student);
  return student?.workType === "school" ? `${course} · ${batch}` : batch !== "—" ? `${batch} (${course})` : course;
};

export class ReportService {

  static async build(type: ReportType, scope: ReportScope, from?: unknown, to?: unknown): Promise<Report> {
    if (!reportTypes.includes(type)) throw statusError("Unknown report", HttpStatus.BAD_REQUEST);
    const range = reportRange(from, to);
    const body = await ({ fees: this.fees, attendance: this.attendance, admissions: this.admissions, academic: this.academic }[type]).call(this, scope, range);
    return { type, from: dayKey(range.start), to: dayKey(range.end), ...body };
  }

  /** Payments received in the range, and fees still due (due date up to the end of the range, or no due date). */
  private static async fees(scope: ReportScope, range: ReturnType<typeof reportRange>) {
    const fees = await FeeModel.find({ adminId: scope.adminId, workType: scope.workType }).populate("student", "studentCode fullName workType coachingInfo schoolInfo").lean();
    const byMonth = new Map<string, number>(), byMode = new Map<string, number>(), byGroup = new Map<string, { collected: number; pending: number }>();
    let collected = 0, receipts = 0;
    const defaulters = new Map<string, Record<string, any>>();
    let pendingTotal = 0;
    for (const fee of fees) {
      const student: any = fee.student;
      const group = student ? placementLabel(student) : "—";
      const groupRow = byGroup.get(group) ?? { collected: 0, pending: 0 };
      for (const payment of fee.payments || []) {
        const paidOn = new Date(payment.paidOn);
        if (paidOn < range.start || paidOn >= range.endExclusive) continue;
        collected += payment.amount; receipts++; groupRow.collected += payment.amount;
        const month = dayKey(paidOn).slice(0, 7);
        byMonth.set(month, (byMonth.get(month) ?? 0) + payment.amount);
        byMode.set(payment.mode, (byMode.get(payment.mode) ?? 0) + payment.amount);
      }
      const balance = Math.max(0, fee.totalFee - (fee.discount || 0) - (fee.paidAmount || 0));
      const due = !fee.dueDate || new Date(fee.dueDate) < range.endExclusive;
      if (balance > 0 && due) {
        pendingTotal += balance; groupRow.pending += balance;
        const key = String(student?._id ?? fee.student);
        const row = defaulters.get(key) ?? { studentCode: student?.studentCode ?? "—", student: student?.fullName ?? "—", group, periods: [], balance: 0, oldestDue: null };
        row.periods.push(fee.period); row.balance += balance;
        if (fee.dueDate && (!row.oldestDue || new Date(fee.dueDate) < new Date(row.oldestDue))) row.oldestDue = dayKey(fee.dueDate);
        defaulters.set(key, row);
      }
      byGroup.set(group, groupRow);
    }
    const groupLabel = scope.workType === "school" ? "Class · Section" : "Batch (course)";
    return {
      summary: [
        { label: "Collected", value: rupees(collected), hint: `${receipts} receipt${receipts === 1 ? "" : "s"}` },
        { label: "Pending", value: rupees(pendingTotal), hint: `${defaulters.size} student${defaulters.size === 1 ? "" : "s"} with dues` },
        { label: "Collection rate", value: `${pct(collected, collected + pendingTotal)}%`, hint: "Collected ÷ (collected + pending)" },
      ],
      tables: [
        { key: "monthly", title: "Collection by month", columns: [{ key: "month", label: "Month" }, { key: "amount", label: "Collected", type: "money" }],
          rows: [...byMonth.entries()].sort().map(([month, amount]) => ({ month: monthLabel(month), amount: rupees(amount) })) },
        { key: "modes", title: "Collection by payment mode", columns: [{ key: "mode", label: "Mode" }, { key: "amount", label: "Collected", type: "money" }, { key: "share", label: "Share", type: "percent" }],
          rows: [...byMode.entries()].sort((a, b) => b[1] - a[1]).map(([mode, amount]) => ({ mode, amount: rupees(amount), share: pct(amount, collected) })) },
        { key: "groups", title: `By ${scope.workType === "school" ? "class" : "batch"}`, columns: [{ key: "group", label: groupLabel }, { key: "collected", label: "Collected", type: "money" }, { key: "pending", label: "Pending", type: "money" }],
          rows: [...byGroup.entries()].filter(([, row]) => row.collected || row.pending).sort((a, b) => b[1].pending - a[1].pending).map(([group, row]) => ({ group, collected: rupees(row.collected), pending: rupees(row.pending) })) },
        { key: "defaulters", title: "Students with pending fees", columns: [{ key: "studentCode", label: "Student ID" }, { key: "student", label: "Student" }, { key: "group", label: groupLabel }, { key: "periods", label: scope.workType === "school" ? "Terms" : "Months" }, { key: "oldestDue", label: "Oldest due date", type: "date" }, { key: "balance", label: "Balance", type: "money" }],
          rows: [...defaulters.values()].sort((a, b) => b.balance - a.balance).map(row => ({ ...row, periods: row.periods.join(", "), balance: rupees(row.balance) })) },
      ],
    };
  }

  /** Present = present or late. Students below 75% are listed. */
  private static async attendance(scope: ReportScope, range: ReturnType<typeof reportRange>) {
    const records = await AttendanceModel.find({ adminId: scope.adminId, workType: scope.workType, date: { $gte: range.start, $lt: range.endExclusive } }).select("student date status").lean();
    const students = await StudentDetailsModel.find({ adminId: scope.adminId, workType: scope.workType }).select("studentCode fullName workType coachingInfo schoolInfo").lean();
    const byId = new Map(students.map(student => [String(student._id), student]));
    const perStudent = new Map<string, { marked: number; present: number; absent: number; late: number; leave: number }>();
    const days = new Set<string>();
    for (const record of records) {
      const row = perStudent.get(String(record.student)) ?? { marked: 0, present: 0, absent: 0, late: 0, leave: 0 };
      row.marked++; row[record.status]++; days.add(dayKey(record.date));
      perStudent.set(String(record.student), row);
    }
    const byGroup = new Map<string, { students: Set<string>; marked: number; attended: number }>();
    let marked = 0, attended = 0;
    const low: Record<string, unknown>[] = [];
    for (const [id, row] of perStudent) {
      const student = byId.get(id);
      const group = student ? placementLabel(student) : "—";
      const came = row.present + row.late;
      marked += row.marked; attended += came;
      const groupRow = byGroup.get(group) ?? { students: new Set<string>(), marked: 0, attended: 0 };
      groupRow.students.add(id); groupRow.marked += row.marked; groupRow.attended += came; byGroup.set(group, groupRow);
      const percent = pct(came, row.marked);
      if (percent < 75) low.push({ studentCode: student?.studentCode ?? "—", student: student?.fullName ?? "—", group, marked: row.marked, present: row.present, late: row.late, absent: row.absent, leave: row.leave, percent });
    }
    const groupLabel = scope.workType === "school" ? "Class · Section" : "Batch (course)";
    return {
      summary: [
        { label: "Average attendance", value: `${pct(attended, marked)}%`, hint: "Present + late ÷ marked" },
        { label: "Days marked", value: days.size, hint: `${perStudent.size} students marked` },
        { label: "Below 75%", value: low.length, hint: "Students needing follow-up" },
      ],
      tables: [
        { key: "groups", title: `Attendance by ${scope.workType === "school" ? "class" : "batch"}`, columns: [{ key: "group", label: groupLabel }, { key: "students", label: "Students", type: "number" }, { key: "marked", label: "Entries", type: "number" }, { key: "percent", label: "Attendance", type: "percent" }],
          rows: [...byGroup.entries()].map(([group, row]) => ({ group, students: row.students.size, marked: row.marked, percent: pct(row.attended, row.marked) })).sort((a, b) => a.percent - b.percent) },
        { key: "low", title: "Students below 75%", columns: [{ key: "studentCode", label: "Student ID" }, { key: "student", label: "Student" }, { key: "group", label: groupLabel }, { key: "marked", label: "Days", type: "number" }, { key: "present", label: "Present", type: "number" }, { key: "late", label: "Late", type: "number" }, { key: "absent", label: "Absent", type: "number" }, { key: "leave", label: "Leave", type: "number" }, { key: "percent", label: "Attendance", type: "percent" }],
          rows: low.sort((a: any, b: any) => a.percent - b.percent) },
      ],
    };
  }

  /** Enquiries dated in the range: by status, source and month, and how many joined. */
  private static async admissions(scope: ReportScope, range: ReturnType<typeof reportRange>) {
    const enquiries = await Admission.find({ adminId: scope.adminId, enquiryDate: { $gte: range.start, $lt: range.endExclusive } }).lean();
    const count = <K extends string>(key: (item: any) => K) => enquiries.reduce((map, item) => map.set(key(item), (map.get(key(item)) ?? 0) + 1), new Map<K, number>());
    const STATUS: Record<string, string> = { new: "New", contacted: "Contacted", interested: "Interested", joined: "Joined", rejected: "Rejected" };
    const SOURCE: Record<string, string> = { website: "Website", referral: "Referral", instagram: "Instagram", walkIn: "Walk-in", phone: "Phone" };
    const joined = enquiries.filter(item => item.status === "joined").length;
    const open = enquiries.filter(item => ["new", "contacted", "interested"].includes(item.status)).length;
    const bySource = new Map<string, { total: number; joined: number }>();
    enquiries.forEach(item => { const row = bySource.get(item.source) ?? { total: 0, joined: 0 }; row.total++; if (item.status === "joined") row.joined++; bySource.set(item.source, row); });
    const byClass = count(item => item.className || "—");
    return {
      summary: [
        { label: "Enquiries", value: enquiries.length, hint: `${open} still open` },
        { label: "Joined", value: joined, hint: "Converted to admission" },
        { label: "Conversion", value: `${pct(joined, enquiries.length)}%`, hint: "Joined ÷ enquiries" },
      ],
      tables: [
        { key: "status", title: "By status", columns: [{ key: "status", label: "Status" }, { key: "count", label: "Enquiries", type: "number" }, { key: "share", label: "Share", type: "percent" }],
          rows: Object.keys(STATUS).map(status => ({ status: STATUS[status], count: count(item => item.status).get(status) ?? 0, share: pct(count(item => item.status).get(status) ?? 0, enquiries.length) })) },
        { key: "source", title: "By source", columns: [{ key: "source", label: "Source" }, { key: "total", label: "Enquiries", type: "number" }, { key: "joined", label: "Joined", type: "number" }, { key: "conversion", label: "Conversion", type: "percent" }],
          rows: [...bySource.entries()].sort((a, b) => b[1].total - a[1].total).map(([source, row]) => ({ source: SOURCE[source] || source, total: row.total, joined: row.joined, conversion: pct(row.joined, row.total) })) },
        { key: "month", title: "By month", columns: [{ key: "month", label: "Month" }, { key: "count", label: "Enquiries", type: "number" }],
          rows: [...count(item => dayKey(item.enquiryDate).slice(0, 7)).entries()].sort().map(([month, value]) => ({ month: monthLabel(month), count: value })) },
        { key: "class", title: scope.workType === "school" ? "By class applied for" : "By course / class", columns: [{ key: "className", label: scope.workType === "school" ? "Class" : "Course / class" }, { key: "count", label: "Enquiries", type: "number" }],
          rows: [...byClass.entries()].sort((a, b) => b[1] - a[1]).map(([className, value]) => ({ className, count: value })) },
      ],
    };
  }

  /** Tests / exams with a paper in the range: averages and pass % by group and subject, and each test's top three. */
  private static async academic(scope: ReportScope, range: ReturnType<typeof reportRange>) {
    const tests = (await Test.find({ adminId: scope.adminId, workType: scope.workType, cancelled: false }).lean())
      .filter(test => test.papers.some(paper => new Date(paper.date) >= range.start && new Date(paper.date) < range.endExclusive));
    const marks = tests.length ? await TestMark.find({ testId: { $in: tests.map(test => test._id) }, marks: { $ne: null }, absent: false }).lean() : [];
    const students = await StudentDetailsModel.find({ _id: { $in: [...new Set(marks.map(mark => String(mark.studentId)))] } }).select("studentCode fullName workType coachingInfo schoolInfo").lean();
    const courses = await Course.find({ _id: { $in: tests.map(test => test.courseId) } }).select("name").lean();
    const studentById = new Map(students.map(student => [String(student._id), student]));
    const courseById = new Map(courses.map(course => [String(course._id), course.name]));
    const passPercent = scope.workType === "school" ? 33 : 40;
    const bySubject = new Map<string, { group: string; subject: string; entries: number; total: number; passed: number }>();
    const perTestStudent = new Map<string, { test: string; student: string; studentCode: string; group: string; got: number; max: number }>();
    let entries = 0, passed = 0, percentSum = 0;
    for (const mark of marks) {
      const test = tests.find(item => String(item._id) === String(mark.testId));
      const paper = test?.papers.find(item => String(item._id) === String(mark.paperId));
      if (!test || !paper) continue;
      const student = studentById.get(String(mark.studentId));
      const group = student ? placementLabel(student) : courseById.get(String(test.courseId)) || "—";
      const percent = ((mark.marks ?? 0) / paper.maxMarks) * 100;
      const pass = (mark.marks ?? 0) >= (paper.passMarks ?? Math.ceil((paper.maxMarks * passPercent) / 100));
      entries++; percentSum += percent; if (pass) passed++;
      const key = `${group}|${paper.subject}`;
      const row = bySubject.get(key) ?? { group, subject: paper.subject, entries: 0, total: 0, passed: 0 };
      row.entries++; row.total += percent; if (pass) row.passed++; bySubject.set(key, row);
      const testKey = `${test._id}|${mark.studentId}`;
      const testRow = perTestStudent.get(testKey) ?? { test: test.term ? `${test.name} (${test.term})` : test.name, student: student?.fullName ?? "—", studentCode: student?.studentCode ?? "—", group, got: 0, max: 0 };
      testRow.got += mark.marks ?? 0; testRow.max += paper.maxMarks; perTestStudent.set(testKey, testRow);
    }
    const toppers = [...[...perTestStudent.values()].reduce((map, row) => map.set(row.test, [...(map.get(row.test) ?? []), row]), new Map<string, any[]>()).entries()]
      .flatMap(([, rows]) => rows.map(row => ({ ...row, percent: pct(row.got, row.max) })).sort((a, b) => b.percent - a.percent).slice(0, 3).map((row, index) => ({ ...row, rank: index + 1, grade: gradeFor(row.percent, scope.workType) })));
    const groupLabel = scope.workType === "school" ? "Class · Section" : "Batch (course)";
    return {
      summary: [
        { label: scope.workType === "school" ? "Exams" : "Tests", value: tests.length, hint: `${tests.filter(test => test.resultsPublished).length} with results published` },
        { label: "Average score", value: `${entries ? Math.round((percentSum / entries) * 10) / 10 : 0}%`, hint: `${entries} marks entered` },
        { label: "Pass rate", value: `${pct(passed, entries)}%`, hint: `Pass mark ${passPercent}% unless set per subject` },
      ],
      tables: [
        { key: "subjects", title: "By subject", columns: [{ key: "group", label: groupLabel }, { key: "subject", label: "Subject" }, { key: "entries", label: "Students", type: "number" }, { key: "average", label: "Average", type: "percent" }, { key: "passRate", label: "Pass rate", type: "percent" }],
          rows: [...bySubject.values()].map(row => ({ group: row.group, subject: row.subject, entries: row.entries, average: Math.round((row.total / row.entries) * 10) / 10, passRate: pct(row.passed, row.entries) })).sort((a, b) => a.group.localeCompare(b.group) || a.subject.localeCompare(b.subject)) },
        { key: "toppers", title: "Top three in each test", columns: [{ key: "test", label: scope.workType === "school" ? "Exam" : "Test" }, { key: "rank", label: "Rank", type: "number" }, { key: "studentCode", label: "Student ID" }, { key: "student", label: "Student" }, { key: "group", label: groupLabel }, { key: "percent", label: "Score", type: "percent" }, { key: "grade", label: "Grade" }],
          rows: toppers },
      ],
    };
  }
}
