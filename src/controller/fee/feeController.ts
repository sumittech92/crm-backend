import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { FeeService } from "../../services/fee/fee.js";
import { resolveOwnerScope } from "../../utilis/ownerScope.js";
import { FeeSubmissionService } from "../../services/fee/feeSubmission.js";
import { handleError } from "../../utilis/records.js";

const handleFeeError = (res, error, label) => {
  if (error.statusCode && error.statusCode < 500) return sendErrorResponse(res, error.message, error.statusCode);
  if (error.code === 11000) return sendErrorResponse(res, "A fee for this student and period already exists", HttpStatus.CONFLICT);
  if (/^Invalid/.test(error.message || "")) return sendErrorResponse(res, error.message, HttpStatus.BAD_REQUEST);
  console.error(`${label}:`, error);
  return sendErrorResponse(res, "Something went wrong", HttpStatus.INTERNAL_SERVER_ERROR);
};

export const getFees = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Fees retrieved successfully", await FeeService.listFees(await resolveOwnerScope(req), req.query));
  } catch (error) { return handleFeeError(res, error, "Fee list error"); }
};

export const getFeeSummary = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Fee summary retrieved successfully", await FeeService.getSummary(await resolveOwnerScope(req)));
  } catch (error) { return handleFeeError(res, error, "Fee summary error"); }
};

export const getStudentFees = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Student fees retrieved successfully", await FeeService.getStudentFees(await resolveOwnerScope(req), req.params.studentId));
  } catch (error) { return handleFeeError(res, error, "Student fee error"); }
};

export const createFee = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Fee created successfully", await FeeService.createFee(await resolveOwnerScope(req), req.body), HttpStatus.CREATED);
  } catch (error) { return handleFeeError(res, error, "Fee creation error"); }
};

export const collectFee = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Payment recorded successfully", await FeeService.collectFee(await resolveOwnerScope(req), req.userData._id, req.body), HttpStatus.CREATED);
  } catch (error) { return handleFeeError(res, error, "Fee collection error"); }
};

export const updateFee = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Fee updated successfully", await FeeService.updateFee(await resolveOwnerScope(req), req.params.id, req.body));
  } catch (error) { return handleFeeError(res, error, "Fee update error"); }
};

export const deleteFee = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Fee deleted successfully", await FeeService.deleteFee(await resolveOwnerScope(req), req.params.id));
  } catch (error) { return handleFeeError(res, error, "Fee deletion error"); }
};

// Portal payments waiting for (or after) the office's check. ?status=pending|approved|rejected
export const getSubmissions = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Payment submissions retrieved successfully", await FeeSubmissionService.list(await resolveOwnerScope(req), { status: req.query.status }));
  } catch (error) { return handleError(res, error, "Fee submission list error"); }
};

export const approveSubmission = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Payment approved and recorded", await FeeSubmissionService.approve(await resolveOwnerScope(req), req.params.id, req.userData._id));
  } catch (error) { return handleError(res, error, "Fee submission approval error"); }
};

export const rejectSubmission = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Payment rejected", await FeeSubmissionService.reject(await resolveOwnerScope(req), req.params.id, req.userData._id, req.body.reason));
  } catch (error) { return handleError(res, error, "Fee submission rejection error"); }
};

// Where students and parents send fees (UPI / bank details shown in the portal).
export const getFeeSettings = async (req, res) => {
  try {
    const { adminId } = await resolveOwnerScope(req);
    return sendSuccessResponse(res, "Payment details retrieved successfully", await FeeSubmissionService.getSettings(adminId));
  } catch (error) { return handleError(res, error, "Fee settings error"); }
};

export const saveFeeSettings = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Payment details saved", await FeeSubmissionService.saveSettings(req.userData._id, req.body));
  } catch (error) { return handleError(res, error, "Fee settings save error"); }
};
