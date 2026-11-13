import express from "express";
import { createSyllabus, deleteSyllabus, getOverview, getSyllabi, getSyllabus, markChapter, updateSyllabus } from "../../controller/syllabus/syllabusController.js";
import { verifyAuthToken, requireStaff } from "../../middleware/authMiddleware.js";
import { validateCreateSyllabus, validateMarkChapter, validateUpdateSyllabus } from "../../validation/syllabus.js";

const router = express.Router();

// Syllabus (chapters per class / course subject) and each section's / batch's progress. Who may change what is checked in the service.
router.get("/overview", verifyAuthToken, requireStaff, getOverview);
router.get("/", verifyAuthToken, requireStaff, getSyllabi);
router.post("/create", verifyAuthToken, requireStaff, validateCreateSyllabus, createSyllabus);
router.get("/:id", verifyAuthToken, requireStaff, getSyllabus);
router.patch("/:id", verifyAuthToken, requireStaff, validateUpdateSyllabus, updateSyllabus);
router.delete("/:id", verifyAuthToken, requireStaff, deleteSyllabus);
router.put("/:id/progress", verifyAuthToken, requireStaff, validateMarkChapter, markChapter);

export default router;
