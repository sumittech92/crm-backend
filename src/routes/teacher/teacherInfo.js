import express from "express";
import { createTeacher, deleteTeacher, getTeacher, getTeachers, updateTeacher } from "../../controller/teacher/teacherInfoController.js";
import { verifyAuthToken, requireAdmin, requireMatchingWorkType } from "../../middleware/authMiddleware.js";
import { validateCreateTeacher } from "../../validation/teacher.js";

const router = express.Router();
////////////
router.post("/create", verifyAuthToken, requireAdmin, validateCreateTeacher, requireMatchingWorkType, createTeacher);
router.get("/", verifyAuthToken, requireAdmin, requireMatchingWorkType, getTeachers);
router.get("/:teacherId", verifyAuthToken, requireAdmin, requireMatchingWorkType, getTeacher);
router.patch("/:teacherId", verifyAuthToken, requireAdmin, requireMatchingWorkType, updateTeacher);
router.delete("/:teacherId", verifyAuthToken, requireAdmin, requireMatchingWorkType, deleteTeacher);

export default router;
