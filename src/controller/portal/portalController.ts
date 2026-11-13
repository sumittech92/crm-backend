import HttpStatus from "http-status-codes";
import { sendSuccessResponse } from "../../utilis/response.js";
import { PortalService } from "../../services/portal/portal.js";
import { handleError, statusError } from "../../utilis/records.js";

/** Runs a portal read for the signed-in student, or the child a parent chose with ?student=<code>. */
const portal = (label: string, message: string, run: (ctx, req) => Promise<unknown>, status = HttpStatus.OK) => async (req, res) => {
  try {
    const ctx = await PortalService.resolve(req.userData, req.role, req.query.student);
    return sendSuccessResponse(res, message, await run(ctx, req), status);
  } catch (error) { return handleError(res, error, label); }
};

export const getMe = portal("Portal profile error", "Profile retrieved successfully", ctx => PortalService.me(ctx));
export const getClass = portal("Portal class error", "Class retrieved successfully", ctx => PortalService.classInfo(ctx));
export const getSubjects = portal("Portal subjects error", "Subjects retrieved successfully", ctx => PortalService.subjects(ctx));
export const getTimetable = portal("Portal timetable error", "Timetable retrieved successfully", ctx => PortalService.timetable(ctx));
export const getAttendance = portal("Portal attendance error", "Attendance retrieved successfully", (ctx, req) => PortalService.attendance(ctx, req.query.month));
export const getFees = portal("Portal fees error", "Fees retrieved successfully", ctx => PortalService.fees(ctx));
export const submitFee = portal("Portal fee submission error", "Payment submitted for verification", (ctx, req) => PortalService.submitFee(ctx, req.body), HttpStatus.CREATED);
export const getTests = portal("Portal tests error", "Tests retrieved successfully", ctx => PortalService.tests(ctx));
export const getResults = portal("Portal results error", "Results retrieved successfully", ctx => PortalService.results(ctx));
export const getMaterials = portal("Portal materials error", "Materials retrieved successfully", ctx => PortalService.materials(ctx));
export const getNotices = portal("Portal notices error", "Notices retrieved successfully", ctx => PortalService.notices(ctx));
export const getUpdates = portal("Portal updates error", "Updates retrieved successfully", ctx => PortalService.updates(ctx));
export const getSyllabus = portal("Portal syllabus error", "Syllabus retrieved successfully", ctx => PortalService.syllabus(ctx));
export const getTasks = portal("Portal tasks error", "Homework and assignments retrieved successfully", ctx => PortalService.tasks(ctx));
// Only the student hands in their own work.
export const submitTask = portal("Portal task submission error", "Assignment submitted", (ctx, req) => {
  if (req.role !== "student") throw statusError("Only the student can submit an assignment", HttpStatus.FORBIDDEN);
  return PortalService.submitTask(ctx, req.params.taskCode, req.body.file);
});
