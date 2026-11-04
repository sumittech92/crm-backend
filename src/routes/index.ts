import express, { Router } from "express";
import authRoutes from "./auth/auth.js";
import studentRoutes from "./student/studentInfo.js";
import teacherRoutes from "./teacher/teacherInfo.js";
import admissionRoutes from "./admission/admission.js";
import websiteRoutes from "./website/website.js";
import uploadRoutes from "./upload/upload.js";
import attendanceRoutes from "./attendance/attendance.js";
import feeRoutes from "./fee/fee.js";

const router = express.Router();

router.use("/auth",authRoutes);
router.use("/student", studentRoutes);
router.use("/teacher", teacherRoutes);
router.use("/admission", admissionRoutes);
router.use("/website", websiteRoutes);
router.use("/upload", uploadRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/fee", feeRoutes);

 export default router;
