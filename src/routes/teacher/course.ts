import express from "express";
import { createCourse, getAllCourses, getCourseById, updateCourse, deleteCourse } from "../../controller/teacher/courseController.js";
import { verifyAuthToken, requireAdmin, requireMatchingWorkType } from "../../middleware/authMiddleware.js";

const router = express.Router();
////////////
router.post("/create", verifyAuthToken, requireAdmin, requireMatchingWorkType, createCourse);
router.get("/", verifyAuthToken, requireAdmin, requireMatchingWorkType, getAllCourses);
router.get("/:id", verifyAuthToken, requireAdmin, requireMatchingWorkType, getCourseById);
router.patch("/:id", verifyAuthToken, requireAdmin, requireMatchingWorkType, updateCourse);
router.delete("/:id", verifyAuthToken, requireAdmin, requireMatchingWorkType, deleteCourse);

export default router;
