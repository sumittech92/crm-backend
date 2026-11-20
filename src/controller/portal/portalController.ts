import HttpStatus from "http-status-codes";
import { sendSuccessResponse } from "../../utilis/response.js";
import { PortalService } from "../../services/portal/portal.js";
import { OnlineClassService } from "../../services/onlineClass/onlineClass.js";
import { MockPaperService, PaperActor } from "../../services/mockPaper/mockPaper.js";
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
// Admit cards and optional subjects are the student's own: parents can see the exam list but not download or change them.
const studentOnly = (req) => { if (req.role !== "student") throw statusError("Only the student can do this from their own login", HttpStatus.FORBIDDEN); };
export const downloadAdmitCard = portal("Portal admit card error", "Admit card ready", (ctx, req) => { studentOnly(req); return PortalService.admitCard(ctx, req.params.testCode); });
export const getOptionalSubjects = portal("Portal optional subjects error", "Optional subjects retrieved successfully", ctx => PortalService.optionalSubjects(ctx));
export const setOptionalSubjects = portal("Portal optional subjects error", "Optional subjects saved", (ctx, req) => { studentOnly(req); return PortalService.setOptionalSubjects(ctx, req.body.subjects); });
// Only the student hands in their own work.
export const submitTask = portal("Portal task submission error", "Assignment submitted", (ctx, req) => {
  if (req.role !== "student") throw statusError("Only the student can submit an assignment", HttpStatus.FORBIDDEN);
  return PortalService.submitTask(ctx, req.params.taskCode, req.body.file);
});

// Live online classes of the student's sections / batches; only the student joins (and is marked present).
export const getOnlineClasses = portal("Portal online classes error", "Online classes retrieved", ctx => OnlineClassService.forStudent(ctx.student));
export const joinOnlineClass = portal("Portal online class join error", "Joining class", (ctx, req) => { studentOnly(req); return OnlineClassService.join(ctx.student, req.params.classCode); });

/** Mock papers are the student's own (school, Classes 9–12). */
const paperActor = (ctx, req): PaperActor => {
  studentOnly(req);
  if (ctx.student.workType !== "school") throw statusError("Mock papers are available for school students in Classes 9 to 12", HttpStatus.FORBIDDEN);
  return { authId: req.userData._id, role: "student", name: ctx.student.fullName || "", adminId: ctx.student.adminId, studentId: ctx.student._id, className: ctx.student.schoolInfo?.className ?? null };
};
export const getPaperOptions = portal("Portal mock paper options error", "Options retrieved", (ctx, req) => { const actor = paperActor(ctx, req); return MockPaperService.options(actor.adminId, actor.className); });
export const getPapers = portal("Portal mock papers error", "Papers retrieved", (ctx, req) => MockPaperService.list(paperActor(ctx, req)));
export const generatePaper = portal("Portal mock paper generation error", "Paper ready", (ctx, req) => MockPaperService.generate(paperActor(ctx, req), req.body), HttpStatus.CREATED);
export const downloadPaper = portal("Portal mock paper download error", "Paper ready to download", (ctx, req) => MockPaperService.download(paperActor(ctx, req), req.params.paperCode));
