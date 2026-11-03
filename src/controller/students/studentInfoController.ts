import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { StudentInfoService } from "../../services/student/studentInfo.js";

// Admins only manage their own students; super admins see every student.
const ownerScope = (req) => req.role === "admin" ? { workType: req.userData.workType, adminId: req.userData._id } : {};

export const createStudent = async (req, res) => {
  try {
    const { workType, adminId } = ownerScope(req);
    const result = await StudentInfoService.createStudent(req.body, workType, adminId);
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
    return sendSuccessResponse(res, "Student retrieved successfully", await StudentInfoService.getStudentById(req.params.studentId, ownerScope(req)));
  } catch (error) { return handleStudentError(res, error, "Student lookup error"); }
};

export const getStudents = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Students retrieved successfully", await StudentInfoService.getAllStudents(ownerScope(req)));
  } catch (error) { return handleStudentError(res, error, "Student list error"); }
};

export const updateStudent = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Student updated successfully", await StudentInfoService.updateStudent(req.params.studentId, req.body, ownerScope(req)));
  } catch (error) { return handleStudentError(res, error, "Student update error"); }
};

export const deleteStudent = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Student deleted successfully", await StudentInfoService.deleteStudent(req.params.studentId, ownerScope(req)));
  } catch (error) { return handleStudentError(res, error, "Student deletion error"); }
};
