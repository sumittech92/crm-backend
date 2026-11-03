import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { StudentInfoService } from "../../services/student/studentInfo.js";

export const createStudent = async (req, res) => {
  try {
    const workType = req.role === "admin" ? req.userData.workType : undefined;
    const result = await StudentInfoService.createStudent(req.body, workType);
    return sendSuccessResponse(res, "Student created successfully", result, HttpStatus.CREATED);
  } catch (error) {
    if (error.statusCode === HttpStatus.CONFLICT || error.code === 11000) {
      return sendErrorResponse(res, error.message || "Email or phone number already exists", HttpStatus.CONFLICT);
    }
    if (error.message === "Student data must match the admin work type") {
      return sendErrorResponse(res, error.message, HttpStatus.BAD_REQUEST);
    }
    console.error("Student creation error:", error);
    return sendErrorResponse(res, "Something went wrong", HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

const handleStudentError = (res, error, label) => {
  if (error.statusCode === HttpStatus.CONFLICT || error.code === 11000) {
    return sendErrorResponse(res, error.message || "Email or phone number already exists", HttpStatus.CONFLICT);
  }
  if (error.message === "Student not found") return sendErrorResponse(res, error.message, HttpStatus.NOT_FOUND);
  if (error.message === "Invalid Student ID") return sendErrorResponse(res, error.message, HttpStatus.BAD_REQUEST);
  console.error(`${label}:`, error);
  return sendErrorResponse(res, "Something went wrong", HttpStatus.INTERNAL_SERVER_ERROR);
};

export const getStudent = async (req, res) => {
  try {
    const workType = req.role === "admin" ? req.userData.workType : undefined;
    return sendSuccessResponse(res, "Student retrieved successfully", await StudentInfoService.getStudentById(req.params.studentId, workType));
  } catch (error) { return handleStudentError(res, error, "Student lookup error"); }
};

export const getStudents = async (_req, res) => {
  try {
    const workType = _req.role === "admin" ? _req.userData.workType : undefined;
    return sendSuccessResponse(res, "Students retrieved successfully", await StudentInfoService.getAllStudents(workType));
  } catch (error) { return handleStudentError(res, error, "Student list error"); }
};

export const updateStudent = async (req, res) => {
  try {
    const workType = req.role === "admin" ? req.userData.workType : undefined;
    return sendSuccessResponse(res, "Student updated successfully", await StudentInfoService.updateStudent(req.params.studentId, req.body, workType));
  } catch (error) { return handleStudentError(res, error, "Student update error"); }
};

export const deleteStudent = async (req, res) => {
  try {
    const workType = req.role === "admin" ? req.userData.workType : undefined;
    return sendSuccessResponse(res, "Student deleted successfully", await StudentInfoService.deleteStudent(req.params.studentId, workType));
  } catch (error) { return handleStudentError(res, error, "Student deletion error"); }
};
