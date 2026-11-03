import express, { Router } from "express";
import authRoutes from "./auth/auth.js";
import studentRoutes from "./student/studentInfo.js";
import teacherRoutes from "./teacher/teacherInfo.js";

const router = express.Router();

router.use("/auth",authRoutes);
router.use("/student", studentRoutes);
router.use("/teacher", teacherRoutes);

 export default router;
