import Teacher from "../model/teacher/teacherInfo.js";

export type StaffScope = { workType?: "school" | "coaching"; adminId?: unknown };

/**
 * Which owner's records the signed-in user may work with.
 * Owners see their own institute, teachers see the institute that created them, super admins see everything.
 */
export const resolveOwnerScope = async (req): Promise<StaffScope> => {
  if (req.role === "admin") return { workType: req.userData.workType, adminId: req.userData._id };
  if (req.role === "teacher") {
    const teacher = await Teacher.findOne({ teacherId: req.userData._id }).select("adminId workType").lean();
    if (!teacher?.adminId) {
      const error = new Error("Teacher is not linked to an institute") as Error & { statusCode?: number };
      error.statusCode = 403;
      throw error;
    }
    return { workType: teacher.workType, adminId: teacher.adminId };
  }
  return {};
};

/** "2026-09-28" -> Date at UTC midnight. Throws on anything else. */
export const parseDay = (value: unknown, label = "date"): Date => {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`Invalid ${label}, use YYYY-MM-DD`);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new Error(`Invalid ${label}`);
  return date;
};

/** "2026-09" -> [first day of month, first day of next month) in UTC. */
export const parseMonth = (value: unknown): { start: Date; end: Date; days: number; key: string } => {
  const text = String(value ?? "").trim() || todayKey().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(text)) throw new Error("Invalid month, use YYYY-MM");
  const [year, month] = text.split("-").map(Number);
  if (month < 1 || month > 12) throw new Error("Invalid month");
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end, days: new Date(Date.UTC(year, month, 0)).getUTCDate(), key: text };
};

/** Today's date as YYYY-MM-DD in the server's local time zone. */
export const todayKey = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Class and batch/section labels shown in registers and fee lists. */
export const studentPlacement = (student: any): { course: string; batch: string } => {
  if (student?.workType === "school") {
    const section = student.schoolInfo?.section;
    return { course: student.schoolInfo?.className || "—", batch: section ? (/^section/i.test(section) ? section : `Section ${section}`) : "—" };
  }
  return { course: student?.coachingInfo?.course || student?.coachingInfo?.className || "—", batch: student?.coachingInfo?.batchTiming || "—" };
};
