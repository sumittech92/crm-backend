import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { SubjectService } from "../../services/subject/subject.js";
import { resolveOwnerScope } from "../../utilis/ownerScope.js";
import { handleError } from "../../utilis/records.js";
import { staffActor } from "../../utilis/staffAccess.js";

export const createSubject = async (req, res) => {
  try {
    if (req.role !== "admin") return sendErrorResponse(res, "Only an Owner can add subjects", HttpStatus.FORBIDDEN);
    const { workType, adminId } = await resolveOwnerScope(req);
    if (!workType) return sendErrorResponse(res, "Admin work type is not configured", HttpStatus.FORBIDDEN);
    return sendSuccessResponse(res, "Subject created successfully", await SubjectService.create(req.body, workType, adminId), HttpStatus.CREATED);
  } catch (error) { return handleError(res, error, "Subject creation error"); }
};

export const getSubjects = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Subjects retrieved successfully", await SubjectService.list(await resolveOwnerScope(req), req.query));
  } catch (error) { return handleError(res, error, "Subject list error"); }
};

export const updateSubject = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Subject updated successfully", await SubjectService.update(req.params.id, req.body, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Subject update error"); }
};

export const deleteSubject = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Subject deleted successfully", await SubjectService.remove(req.params.id, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Subject deletion error"); }
};

// Teacher: the subjects and sections they teach.
export const getMySubjects = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Subjects retrieved successfully", await SubjectService.mine(await staffActor(req)));
  } catch (error) { return handleError(res, error, "My subjects error"); }
};
