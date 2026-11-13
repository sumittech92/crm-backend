import Batch from "../model/teacher/batchModel.js";
import Subject from "../model/subject/subject.js";
import Teacher from "../model/teacher/teacherInfo.js";
import { resolveOwnerScope } from "./ownerScope.js";

/** Who is asking: the owner, one of their teachers (with their Teacher profile) or a super admin. */
export type StaffActor = {
  role: string;
  userId: unknown;
  adminId?: unknown;
  workType?: "school" | "coaching";
  teacher?: { _id: unknown; subjects: string[] } | null;
};

/** The Teacher profile behind a teacher sign-in (for batch and subject checks). */
export const teacherProfile = async (userId: unknown) => {
  const teacher = await Teacher.findOne({ teacherId: userId }).select("_id schoolInfo.subjects coachingInfo.subjects").lean();
  return teacher ? { _id: teacher._id, subjects: [...(teacher.schoolInfo?.subjects || []), ...(teacher.coachingInfo?.subjects || [])] } : null;
};

export const staffActor = async (req): Promise<StaffActor> => {
  const { adminId, workType } = await resolveOwnerScope(req);
  return {
    role: req.role, userId: req.userData._id, adminId, workType,
    teacher: req.role === "teacher" ? await teacherProfile(req.userData._id) : null,
  };
};

/** Batches / sections the teacher is assigned to (coaching batch teacher, school class teacher). */
export const teacherBatchIds = async (actor: StaffActor): Promise<string[]> => {
  if (actor.role !== "teacher" || !actor.teacher) return [];
  return (await Batch.find({ adminId: actor.adminId, teacherIds: actor.teacher._id }).select("_id").lean()).map(batch => String(batch._id));
};

/**
 * Every section / batch the teacher works with: their batches / class-teacher sections, plus (school) sections where
 * they teach a subject under Subjects. Used for students, attendance, notices and study material; exams keep teacherBatchIds.
 */
export const teacherSectionIds = async (actor: StaffActor): Promise<string[]> => {
  if (actor.role !== "teacher" || !actor.teacher) return [];
  const own = await teacherBatchIds(actor);
  if (actor.workType !== "school") return own;
  const teacherId = String(actor.teacher._id);
  const subjects = await Subject.find({ adminId: actor.adminId, "sections.teacherId": actor.teacher._id }).select("sections").lean();
  const taught = subjects.flatMap(subject => subject.sections.filter(section => String(section.teacherId) === teacherId).map(section => String(section.batchId)));
  return [...new Set([...own, ...taught])];
};

export const isOwnerLike = (actor: StaffActor) => actor.role === "admin" || actor.role === "superAdmin";

/** In schools, teachers also work with their own subjects across classes. */
export const teachesSubject = (actor: StaffActor, subject: unknown) =>
  actor.role === "teacher" && !!subject && (actor.teacher?.subjects || []).some(own => own.toLowerCase() === String(subject).toLowerCase());

/** Owner / super admin records of their own institute; super admins see all. */
export const actorScope = (actor: StaffActor) => actor.role === "superAdmin" ? {} : { adminId: actor.adminId, workType: actor.workType };
