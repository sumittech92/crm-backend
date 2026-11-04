import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { AttendanceService } from "../../services/attendance/attendance.js";
import { resolveOwnerScope } from "../../utilis/ownerScope.js";

const handleAttendanceError = (res, error, label) => {
  if (error.statusCode === HttpStatus.FORBIDDEN) return sendErrorResponse(res, error.message, HttpStatus.FORBIDDEN);
  if (error.message === "Student not found" || error.message?.startsWith("Student not found:")) return sendErrorResponse(res, error.message, HttpStatus.NOT_FOUND);
  if (/^(Invalid|Attendance cannot)/.test(error.message || "")) return sendErrorResponse(res, error.message, HttpStatus.BAD_REQUEST);
  console.error(`${label}:`, error);
  return sendErrorResponse(res, "Something went wrong", HttpStatus.INTERNAL_SERVER_ERROR);
};

export const getRegister = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Attendance register retrieved successfully", await AttendanceService.getRegister(await resolveOwnerScope(req), req.query.date));
  } catch (error) { return handleAttendanceError(res, error, "Attendance register error"); }
};

export const markAttendance = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Attendance saved successfully", await AttendanceService.markAttendance(await resolveOwnerScope(req), req.userData._id, req.body));
  } catch (error) { return handleAttendanceError(res, error, "Attendance save error"); }
};

export const getMonthly = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Monthly attendance retrieved successfully", await AttendanceService.getMonthly(await resolveOwnerScope(req), req.query.month));
  } catch (error) { return handleAttendanceError(res, error, "Monthly attendance error"); }
};

export const getSummary = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Attendance summary retrieved successfully", await AttendanceService.getSummary(await resolveOwnerScope(req), req.query.month));
  } catch (error) { return handleAttendanceError(res, error, "Attendance summary error"); }
};

export const getStudentHistory = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Student attendance retrieved successfully", await AttendanceService.getStudentHistory(await resolveOwnerScope(req), req.params.studentId, req.query.month));
  } catch (error) { return handleAttendanceError(res, error, "Student attendance error"); }
};
