import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { CourseService } from "../../services/teacher/courseServices.js";
import { resolveOwnerScope } from "../../utilis/ownerScope.js";

const handleError = (res, error, label) => {
  if (error.statusCode) return sendErrorResponse(res, error.message, error.statusCode);
  if (error.code === 11000) return sendErrorResponse(res, "A course with this name already exists", HttpStatus.CONFLICT);
  console.error(`${label}:`, error);
  return sendErrorResponse(res, "Something went wrong", HttpStatus.INTERNAL_SERVER_ERROR);
};

export const createCourse = async (req, res) => {
  try {
    if (req.role !== "admin") return sendErrorResponse(res, "Only an Owner can add courses", HttpStatus.FORBIDDEN);
    const { workType, adminId } = await resolveOwnerScope(req);
    if (!workType) return sendErrorResponse(res, "Admin work type is not configured", HttpStatus.FORBIDDEN);
    return sendSuccessResponse(res, "Course created successfully", await CourseService.createCourse(req.body, workType, adminId), HttpStatus.CREATED);
  } catch (error) { return handleError(res, error, "Course creation error"); }
};

// Owners, their teachers (for dropdowns) and super admins.
export const getAllCourses = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Courses retrieved successfully", await CourseService.getAllCourses(await resolveOwnerScope(req), { status: req.query.status }));
  } catch (error) { return handleError(res, error, "Course list error"); }
};

export const getCourseById = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Course retrieved successfully", await CourseService.getCourse(req.params.courseId, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Course lookup error"); }
};

export const updateCourse = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Course updated successfully", await CourseService.updateCourse(req.params.courseId, req.body, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Course update error"); }
};

export const deleteCourse = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Course deleted successfully", await CourseService.deleteCourse(req.params.courseId, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Course deletion error"); }
};
