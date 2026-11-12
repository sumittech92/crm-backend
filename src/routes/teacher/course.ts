import express from "express";
import { createCourse, getAllCourses, getCourseById, updateCourse, deleteCourse } from "../../controller/teacher/courseController.js";
import { verifyAuthToken, requireAdmin, requireStaff } from "../../middleware/authMiddleware.js";
import { validateCreateCourse, validateUpdateCourse } from "../../validation/course.js";

const router = express.Router();

// Coaching courses / school classes. Teachers can read them (dropdowns); only the owner changes them.
router.post("/create", verifyAuthToken, requireAdmin, validateCreateCourse, createCourse);
router.get("/", verifyAuthToken, requireStaff, getAllCourses);
router.get("/:courseId", verifyAuthToken, requireStaff, getCourseById);
router.patch("/:courseId", verifyAuthToken, requireAdmin, validateUpdateCourse, updateCourse);
router.delete("/:courseId", verifyAuthToken, requireAdmin, deleteCourse);

export default router;
