import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { BatchService } from "../../services/teacher/batchServices.js";
import { resolveOwnerScope } from "../../utilis/ownerScope.js";

const handleError = (res, error, label) => {
  if (error.statusCode) return sendErrorResponse(res, error.message, error.statusCode);
  console.error(`${label}:`, error);
  return sendErrorResponse(res, "Something went wrong", HttpStatus.INTERNAL_SERVER_ERROR);
};

export const createBatch = async (req, res) => {
  try {
    if (req.role !== "admin") return sendErrorResponse(res, "Only an Owner can add batches", HttpStatus.FORBIDDEN);
    const { workType, adminId } = await resolveOwnerScope(req);
    if (!workType) return sendErrorResponse(res, "Admin work type is not configured", HttpStatus.FORBIDDEN);
    return sendSuccessResponse(res, "Batch created successfully", await BatchService.createBatch(req.body, workType, adminId), HttpStatus.CREATED);
  } catch (error) { return handleError(res, error, "Batch creation error"); }
};

// Owners, their teachers (dropdowns, attendance) and super admins. ?courseCode= and ?status= narrow the list.
export const getAllBatches = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Batches retrieved successfully", await BatchService.getAllBatches(await resolveOwnerScope(req), { status: req.query.status, courseCode: req.query.courseCode }));
  } catch (error) { return handleError(res, error, "Batch list error"); }
};

export const getBatchById = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Batch retrieved successfully", await BatchService.getBatch(req.params.batchId, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Batch lookup error"); }
};

export const updateBatch = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Batch updated successfully", await BatchService.updateBatch(req.params.batchId, req.body, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Batch update error"); }
};

export const deleteBatch = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Batch deleted successfully", await BatchService.deleteBatch(req.params.batchId, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Batch deletion error"); }
};
