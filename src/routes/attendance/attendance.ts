import express from "express";
import { getMonthly, getRegister, getStudentHistory, getSummary, markAttendance } from "../../controller/attendance/attendanceController.js";
import { verifyAuthToken, requireStaff } from "../../middleware/authMiddleware.js";
import { validateMarkAttendance } from "../../validation/attendance.js";

const router = express.Router();

// Owners, their teachers and super admins. Records are scoped to the owner in the controller.
router.get("/", verifyAuthToken, requireStaff, getRegister);
router.post("/mark", verifyAuthToken, requireStaff, validateMarkAttendance, markAttendance);
router.get("/monthly", verifyAuthToken, requireStaff, getMonthly);
router.get("/summary", verifyAuthToken, requireStaff, getSummary);
router.get("/student/:studentId", verifyAuthToken, requireStaff, getStudentHistory);

export default router;
