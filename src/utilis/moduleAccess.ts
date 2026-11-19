import AuthModel from "../model/Auth/auth.js";
import Teacher from "../model/teacher/teacherInfo.js";
import StudentDetailsModel from "../model/students/studentInfo.js";

/**
 * Modules the Super Admin can turn off per institute. Core pages (dashboard, students, teachers,
 * classes / courses, sections / batches, subjects, sessions, profile) are always on.
 */
export const MODULE_KEYS = [
  "admissions", "attendance", "fees", "exams", "homework", "timetable", "syllabus", "library", "labs",
  "salary", "entrance", "notices", "events", "posts", "gallery", "materials", "website", "reports",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

/** API path ("/api/v1/<segment>") -> module it belongs to. */
const ROUTE_MODULES: Record<string, ModuleKey> = {
  admission: "admissions", attendance: "attendance", fee: "fees", test: "exams", task: "homework", timetable: "timetable",
  syllabus: "syllabus", library: "library", lab: "labs", salary: "salary", entrance: "entrance", notice: "notices",
  event: "events", post: "posts", gallery: "gallery", material: "materials", website: "website", report: "reports",
};

export const MODULE_LABELS: Record<ModuleKey, string> = {
  admissions: "Admissions", attendance: "Attendance", fees: "Fees", exams: "Exams & results", homework: "Homework & assignments",
  timetable: "Timetable", syllabus: "Syllabus", library: "Library", labs: "Labs", salary: "Teacher salary", entrance: "Entrance tests",
  notices: "Notices", events: "Events", posts: "Posts", gallery: "Gallery", materials: "Study materials", website: "Website", reports: "Reports",
};

export const moduleForPath = (baseUrl: string): ModuleKey | undefined => ROUTE_MODULES[String(baseUrl || "").split("/").filter(Boolean).pop() || ""];

/** The owner account whose module settings apply to this user (owners: themselves; teachers / students: their institute). */
const ownerIdFor = async (user: { _id: unknown; role?: string | null }): Promise<unknown> => {
  if (user.role === "admin") return user._id;
  if (user.role === "teacher") return (await Teacher.findOne({ teacherId: user._id }).select("adminId").lean())?.adminId ?? null;
  if (user.role === "student") return (await StudentDetailsModel.findOne({ studentId: user._id }).select("adminId").lean())?.adminId ?? null;
  return null;
};

type AccessUser = { _id: unknown; role?: string | null; disabledModules?: string[]; isSuspended?: boolean };

/** The institute's module list and whether the Super Admin deactivated it (owners: their own account). */
export const instituteAccessFor = async (user: AccessUser): Promise<{ disabledModules: string[]; suspended: boolean }> => {
  if (user.role === "admin") return { disabledModules: user.disabledModules ?? [], suspended: !!user.isSuspended };
  const ownerId = await ownerIdFor(user);
  if (!ownerId) return { disabledModules: [], suspended: false };
  const owner = await AuthModel.findById(ownerId).select("disabledModules isSuspended").lean();
  return { disabledModules: owner?.disabledModules ?? [], suspended: !!owner?.isSuspended };
};

/** Modules turned off for this user's institute ([] when everything is on). */
export const disabledModulesFor = async (user: AccessUser): Promise<string[]> => (await instituteAccessFor(user)).disabledModules;

export const SUSPENDED_MESSAGE = "This workspace is deactivated. Contact EduNexa support to activate it.";
