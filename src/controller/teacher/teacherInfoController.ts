import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { TeacherInfoService } from "../../services/teacher/teacherInfo.js";

const handleError = (res, error, label) => {
  if (error.statusCode === HttpStatus.CONFLICT || error.code === 11000) {
    return sendErrorResponse(res, error.message || "Email or phone number already exists", HttpStatus.CONFLICT);
  }
  if (error.message === "Teacher data must match the admin work type") {
    return sendErrorResponse(res, error.message, HttpStatus.BAD_REQUEST);
  }
  if (error.message === "Teacher not found") return sendErrorResponse(res, error.message, HttpStatus.NOT_FOUND);
  if (error.message === "Invalid Teacher ID") return sendErrorResponse(res, error.message, HttpStatus.BAD_REQUEST);
  console.error(`${label}:`, error);
  return sendErrorResponse(res, "Something went wrong", HttpStatus.INTERNAL_SERVER_ERROR);
};

export const createTeacher = async (req, res) => {
  try {
    const workType = req.role === "admin" ? req.userData.workType : undefined;
    const result = await TeacherInfoService.createTeacher(req.body, workType);
    return sendSuccessResponse(res, "Teacher created successfully", result, HttpStatus.CREATED);
  } catch (error) { return handleError(res, error, "Teacher creation error"); }
};

export const getTeacher = async (req, res) => {
  try {
    const workType = req.role === "admin" ? req.userData.workType : undefined;
    return sendSuccessResponse(res, "Teacher retrieved successfully", await TeacherInfoService.getTeacherById(req.params.teacherId, workType));
  } catch (error) { return handleError(res, error, "Teacher lookup error"); }
};

export const getTeachers = async (_req, res) => {
  try {
    const workType = _req.role === "admin" ? _req.userData.workType : undefined;
    return sendSuccessResponse(res, "Teachers retrieved successfully", await TeacherInfoService.getAllTeachers(workType));
  } catch (error) { return handleError(res, error, "Teacher list error"); }
};

export const updateTeacher = async (req, res) => {
  try {
    const workType = req.role === "admin" ? req.userData.workType : undefined;
    return sendSuccessResponse(res, "Teacher updated successfully", await TeacherInfoService.updateTeacher(req.params.teacherId, req.body, workType));
  } catch (error) { return handleError(res, error, "Teacher update error"); }
};

export const deleteTeacher = async (req, res) => {
  try {
    const workType = req.role === "admin" ? req.userData.workType : undefined;
    return sendSuccessResponse(res, "Teacher deleted successfully", await TeacherInfoService.deleteTeacher(req.params.teacherId, workType));
  } catch (error) { return handleError(res, error, "Teacher deletion error"); }
};
