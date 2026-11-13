import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { SessionService } from "../../services/session/session.js";
import { resolveOwnerScope } from "../../utilis/ownerScope.js";
import { handleError } from "../../utilis/records.js";

export const createSession = async (req, res) => {
  try {
    if (req.role !== "admin") return sendErrorResponse(res, "Only an Owner can add academic sessions", HttpStatus.FORBIDDEN);
    const { workType, adminId } = await resolveOwnerScope(req);
    if (!workType) return sendErrorResponse(res, "Admin work type is not configured", HttpStatus.FORBIDDEN);
    return sendSuccessResponse(res, "Session created successfully", await SessionService.create(req.body, workType, adminId), HttpStatus.CREATED);
  } catch (error) { return handleError(res, error, "Session creation error"); }
};

export const getSessions = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Sessions retrieved successfully", await SessionService.list(await resolveOwnerScope(req), req.query));
  } catch (error) { return handleError(res, error, "Session list error"); }
};

export const updateSession = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Session updated successfully", await SessionService.update(req.params.id, req.body, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Session update error"); }
};

export const deleteSession = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Session deleted successfully", await SessionService.remove(req.params.id, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Session deletion error"); }
};
