import mongoose from "mongoose";
import AttendanceModel, { AttendanceStatus } from "../../model/attendance/attendance.js";
import StudentDetailsModel from "../../model/students/studentInfo.js";
import { StaffScope, parseDay, parseMonth, studentPlacement, todayKey } from "../../utilis/ownerScope.js";

const STUDENT_FIELDS = "studentCode fullName workType adminId schoolInfo coachingInfo";

/** Present and late both count as attended. */
const rateOf = (counts: { present?: number; late?: number; marked?: number }) =>
  counts.marked ? Math.round((((counts.present || 0) + (counts.late || 0)) / counts.marked) * 100) : 0;

const groupName = (student: any) => {
  const { course, batch } = studentPlacement(student);
  return student.workType === "school" ? `${course} · ${batch}` : batch !== "—" ? batch : course;
};

export class AttendanceService {
  private static students(scope: StaffScope) {
    return StudentDetailsModel.find(scope).select(STUDENT_FIELDS).sort({ fullName: 1 }).lean();
  }

  /** Per-student counts between two dates. */
  private static async countsByStudent(studentIds: mongoose.Types.ObjectId[], start: Date, end: Date) {
    const rows = await AttendanceModel.aggregate([
      { $match: { student: { $in: studentIds }, date: { $gte: start, $lt: end } } },
      { $group: { _id: { student: "$student", status: "$status" }, count: { $sum: 1 } } },
    ]);
    const counts = new Map<string, Record<string, number>>();
    for (const row of rows) {
      const key = row._id.student.toString();
      const entry = counts.get(key) || { present: 0, absent: 0, late: 0, leave: 0, marked: 0 };
      entry[row._id.status] = row.count;
      entry.marked += row.count;
      counts.set(key, entry);
    }
    return counts;
  }

  /** Daily register: every student in scope with their mark for the day (null when not marked yet). */
  static async getRegister(scope: StaffScope, date: unknown) {
    const day = parseDay(date || todayKey());
    const students = await this.students(scope);
    const ids = students.map((student) => student._id);
    const monthStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
    const nextDay = new Date(day.getTime() + 86400000);
    const [marks, counts] = await Promise.all([
      AttendanceModel.find({ student: { $in: ids }, date: day }).select("student status note").lean(),
      this.countsByStudent(ids, monthStart, nextDay),
    ]);
    const markOf = new Map(marks.map((mark) => [mark.student.toString(), mark]));
    return {
      date: day.toISOString().slice(0, 10),
      students: students.map((student) => ({
        _id: student._id,
        studentId: student.studentCode,
        fullName: student.fullName,
        ...studentPlacement(student),
        group: groupName(student),
        status: markOf.get(student._id.toString())?.status ?? null,
        note: markOf.get(student._id.toString())?.note ?? null,
        percent: rateOf(counts.get(student._id.toString()) || {}),
      })),
    };
  }

  /** Save (or overwrite) the register for one day. Only students in scope can be marked. */
  static async markAttendance(scope: StaffScope, markedBy: unknown, input: { date: string; records: { studentId: string; status: AttendanceStatus; note?: string | null }[] }) {
    const day = parseDay(input.date);
    if (day.toISOString().slice(0, 10) > todayKey()) throw new Error("Attendance cannot be saved for a future date");
    const codes = [...new Set(input.records.map((record) => record.studentId))];
    const students = await StudentDetailsModel.find({ ...scope, studentCode: { $in: codes } }).select("studentCode workType adminId").lean();
    const byCode = new Map(students.map((student) => [student.studentCode, student]));
    const missing = codes.filter((code) => !byCode.has(code));
    if (missing.length) throw new Error(`Student not found: ${missing.join(", ")}`);

    const result = await AttendanceModel.bulkWrite(input.records.map((record) => {
      const student = byCode.get(record.studentId);
      return {
        updateOne: {
          filter: { student: student._id, date: day },
          update: {
            $set: { status: record.status, note: record.note ?? null, markedBy: markedBy ?? null, adminId: student.adminId ?? null, workType: student.workType },
          },
          upsert: true,
        },
      };
    }));
    return { date: day.toISOString().slice(0, 10), saved: input.records.length, created: result.upsertedCount, updated: result.modifiedCount };
  }

  /** Month grid: each student's mark per day, plus their rate for the month. */
  static async getMonthly(scope: StaffScope, month: unknown) {
    const range = parseMonth(month);
    const students = await this.students(scope);
    const ids = students.map((student) => student._id);
    const marks = await AttendanceModel.find({ student: { $in: ids }, date: { $gte: range.start, $lt: range.end } }).select("student date status").lean();
    const grid = new Map<string, Record<number, AttendanceStatus>>();
    for (const mark of marks) {
      const key = mark.student.toString();
      const days = grid.get(key) || {};
      days[mark.date.getUTCDate()] = mark.status;
      grid.set(key, days);
    }
    return {
      month: range.key,
      days: range.days,
      students: students.map((student) => {
        const days = grid.get(student._id.toString()) || {};
        const values = Object.values(days);
        const count = (status: string) => values.filter((value) => value === status).length;
        return {
          studentId: student.studentCode,
          fullName: student.fullName,
          ...studentPlacement(student),
          group: groupName(student),
          days,
          present: count("present"), absent: count("absent"), late: count("late"), leave: count("leave"),
          percent: rateOf({ present: count("present"), late: count("late"), marked: values.length }),
        };
      }),
    };
  }

  /** Institute-wide rate for the month, a daily trend, the rate per batch / section and last month's rate. */
  static async getSummary(scope: StaffScope, month: unknown) {
    const range = parseMonth(month);
    const previousStart = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth() - 1, 1));
    const students = await this.students(scope);
    const ids = students.map((student) => student._id);
    const groupOf = new Map(students.map((student) => [student._id.toString(), groupName(student)]));

    const [daily, perStudent, previous] = await Promise.all([
      AttendanceModel.aggregate([
        { $match: { student: { $in: ids }, date: { $gte: range.start, $lt: range.end } } },
        { $group: { _id: { date: "$date", status: "$status" }, count: { $sum: 1 } } },
        { $sort: { "_id.date": 1 } },
      ]),
      this.countsByStudent(ids, range.start, range.end),
      this.countsByStudent(ids, previousStart, range.start),
    ]);

    const trendMap = new Map<string, Record<string, number>>();
    for (const row of daily) {
      const key = row._id.date.toISOString().slice(0, 10);
      const entry = trendMap.get(key) || { present: 0, absent: 0, late: 0, leave: 0, marked: 0 };
      entry[row._id.status] = row.count;
      entry.marked += row.count;
      trendMap.set(key, entry);
    }
    const trend = [...trendMap.entries()].map(([date, counts]) => ({ date, ...counts, rate: rateOf(counts) }));

    const total = { present: 0, late: 0, absent: 0, leave: 0, marked: 0 };
    const groups = new Map<string, typeof total>();
    for (const [studentKey, counts] of perStudent) {
      const name = groupOf.get(studentKey) || "—";
      const group = groups.get(name) || { present: 0, late: 0, absent: 0, leave: 0, marked: 0 };
      for (const field of Object.keys(total)) { total[field] += counts[field] || 0; group[field] += counts[field] || 0; }
      groups.set(name, group);
    }
    const previousTotal = { present: 0, late: 0, marked: 0 };
    for (const counts of previous.values()) for (const field of Object.keys(previousTotal)) previousTotal[field] += counts[field] || 0;

    return {
      month: range.key,
      rate: rateOf(total),
      previousRate: previousTotal.marked ? rateOf(previousTotal) : null,
      totals: total,
      trend,
      groups: [...groups.entries()].map(([name, counts]) => ({ name, rate: rateOf(counts) })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /** One student's month: counts and each marked day. */
  static async getStudentHistory(scope: StaffScope, studentCode: string, month: unknown) {
    const range = parseMonth(month);
    const student = await StudentDetailsModel.findOne({ ...scope, studentCode }).select(STUDENT_FIELDS).lean();
    if (!student) throw new Error("Student not found");
    const records = await AttendanceModel.find({ student: student._id, date: { $gte: range.start, $lt: range.end } }).select("date status note").sort({ date: 1 }).lean();
    const count = (status: string) => records.filter((record) => record.status === status).length;
    return {
      month: range.key,
      student: { studentId: student.studentCode, fullName: student.fullName, ...studentPlacement(student) },
      present: count("present"), absent: count("absent"), late: count("late"), leave: count("leave"),
      percent: rateOf({ present: count("present"), late: count("late"), marked: records.length }),
      records: records.map((record) => ({ date: record.date.toISOString().slice(0, 10), status: record.status, note: record.note })),
    };
  }
}
