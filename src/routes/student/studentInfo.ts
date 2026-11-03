import express from "express";
import { createStudent, deleteStudent, getStudent, getStudents, updateStudent } from "../../controller/students/studentInfoController.js";
import { verifyAuthToken, requireAdmin, requireMatchingWorkType } from "../../middleware/authMiddleware.js";
import { validateCreateStudent, validateUpdateStudent } from "../../validation/student.js";

const router = express.Router();

router.post("/create", verifyAuthToken, requireAdmin, validateCreateStudent, requireMatchingWorkType, createStudent);
router.get("/", verifyAuthToken, requireAdmin, requireMatchingWorkType, getStudents);
router.get("/:studentId", verifyAuthToken, requireAdmin, requireMatchingWorkType, getStudent);
router.patch("/:studentId", verifyAuthToken, requireAdmin, validateUpdateStudent, requireMatchingWorkType, updateStudent);
router.delete("/:studentId", verifyAuthToken, requireAdmin, requireMatchingWorkType, deleteStudent);

export default router;
