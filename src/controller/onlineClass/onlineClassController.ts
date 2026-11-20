import HttpStatus from "http-status-codes";
import { sendSuccessResponse } from "../../utilis/response.js";
import { ClassActor, OnlineClassService } from "../../services/onlineClass/onlineClass.js";
import { resolveOwnerScope } from "../../utilis/ownerScope.js";
import Teacher from "../../model/teacher/teacherInfo.js";
import { handleError, statusError } from "../../utilis/records.js";

/** Owner (any class) or teacher (their own classes). */
const actorFor = async (req): Promise<ClassActor> => {
  if (req.role === "admin") return { role: "admin", teacher: null };
  if (req.role === "teacher") return { role: "teacher", teacher: await Teacher.findOne({ teacherId: req.userData._id }).select("fullName teacherCode").lean() };
  throw statusError("Only the owner and teachers manage online classes", HttpStatus.FORBIDDEN);
};
const run = (label: string, message: string, work: (req, scope, actor: ClassActor) => Promise<unknown>, status = HttpStatus.OK) => async (req, res) => {
  try { return sendSuccessResponse(res, message, await work(req, await resolveOwnerScope(req), await actorFor(req)), status); } catch (error) { return handleError(res, error, label); }
};

export const getClasses = run("Online class list error", "Online classes retrieved", (req, scope, actor) => OnlineClassService.list(scope, actor));
export const createClass = run("Online class creation error", "Online class scheduled", (req, scope, actor) => OnlineClassService.create(req.body, scope, actor), HttpStatus.CREATED);
export const updateClass = run("Online class update error", "Online class updated", (req, scope, actor) => OnlineClassService.update(req.params.id, req.body, scope, actor));
export const deleteClass = run("Online class deletion error", "Online class deleted", (req, scope, actor) => OnlineClassService.remove(req.params.id, scope, actor, req.query.series === "true"));
export const startClass = run("Online class start error", "Class started", (req, scope, actor) => OnlineClassService.start(req.params.id, scope, actor));
export const completeClass = run("Online class completion error", "Class completed", (req, scope, actor) => OnlineClassService.complete(req.params.id, req.body.recordingLink, scope, actor));
export const getAttendance = run("Online class attendance error", "Attendance retrieved", (req, scope, actor) => OnlineClassService.attendance(req.params.id, scope, actor));
