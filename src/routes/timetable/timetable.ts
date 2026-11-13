import express from "express";
import { createPeriod, getPeriods, updatePeriod, deletePeriod, getToday, getMyClasses } from "../../controller/timetable/timetableController.js";
import { verifyAuthToken, requireAdmin, requireStaff } from "../../middleware/authMiddleware.js";
import { validateCreatePeriod, validateUpdatePeriod } from "../../validation/timetable.js";

const router = express.Router();

// School timetable periods. Teachers read them (and their own day / classes); only the owner changes them.
router.post("/create", verifyAuthToken, requireAdmin, validateCreatePeriod, createPeriod);
router.get("/", verifyAuthToken, requireStaff, getPeriods);
router.get("/today", verifyAuthToken, requireStaff, getToday);
router.get("/my-classes", verifyAuthToken, requireStaff, getMyClasses);
router.patch("/:id", verifyAuthToken, requireAdmin, validateUpdatePeriod, updatePeriod);
router.delete("/:id", verifyAuthToken, requireAdmin, deletePeriod);

export default router;
