import HttpStatus from "http-status-codes";
import { sendSuccessResponse } from "../../utilis/response.js";
import { MockPaperService, PaperActor } from "../../services/mockPaper/mockPaper.js";
import { resolveOwnerScope } from "../../utilis/ownerScope.js";
import { handleError, statusError } from "../../utilis/records.js";

/** Owner / teacher of a school. */
const staffActor = async (req): Promise<PaperActor> => {
  const scope = await resolveOwnerScope(req);
  if (scope.workType !== "school") throw statusError("Mock papers are available for schools (Classes 9 to 12)", HttpStatus.FORBIDDEN);
  return { authId: req.userData._id, role: req.role === "admin" ? "admin" : "teacher", name: req.userData.fullName || "", adminId: scope.adminId };
};
const run = (label: string, message: string, work: (actor: PaperActor, req) => Promise<unknown>, status = HttpStatus.OK) => async (req, res) => {
  try { return sendSuccessResponse(res, message, await work(await staffActor(req), req), status); } catch (error) { return handleError(res, error, label); }
};

export const getPaperOptions = run("Mock paper options error", "Options retrieved", actor => MockPaperService.options(actor.adminId));
export const getPapers = run("Mock paper list error", "Papers retrieved", (actor, req) => MockPaperService.list(actor, req.query));
export const generatePaper = run("Mock paper generation error", "Paper ready", (actor, req) => MockPaperService.generate(actor, req.body), HttpStatus.CREATED);
export const downloadPaper = run("Mock paper download error", "Paper ready to download", (actor, req) => MockPaperService.download(actor, req.params.id));
