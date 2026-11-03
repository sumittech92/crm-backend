import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { TeacherInfoService } from "../../services/teacher/teacherInfo.js";

// Admins only manage their own teachers; super admins see every teacher.
const ownerScope = (req) => req.role === "admin" ? { workType: req.userData.workType, adminId: req.userData._id } : {};

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
    const { workType, adminId } = ownerScope(req);
    const result = await TeacherInfoService.createTeacher(req.body, workType, adminId);
    return sendSuccessResponse(res, "Teacher created successfully", result, HttpStatus.CREATED);
  } catch (error) { return handleError(res, error, "Teacher creation error"); }
};

export const getTeacher = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Teacher retrieved successfully", await TeacherInfoService.getTeacherById(req.params.teacherId, ownerScope(req)));
  } catch (error) { return handleError(res, error, "Teacher lookup error"); }
};

export const getTeachers = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Teachers retrieved successfully", await TeacherInfoService.getAllTeachers(ownerScope(req)));
  } catch (error) { return handleError(res, error, "Teacher list error"); }
};

export const updateTeacher = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Teacher updated successfully", await TeacherInfoService.updateTeacher(req.params.teacherId, req.body, ownerScope(req)));
  } catch (error) { return handleError(res, error, "Teacher update error"); }
};

export const deleteTeacher = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Teacher deleted successfully", await TeacherInfoService.deleteTeacher(req.params.teacherId, ownerScope(req)));
  } catch (error) { return handleError(res, error, "Teacher deletion error"); }
};
