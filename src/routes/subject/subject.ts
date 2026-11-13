import express from "express";
import { createSubject, getSubjects, updateSubject, deleteSubject, getMySubjects } from "../../controller/subject/subjectController.js";
import { verifyAuthToken, requireAdmin, requireStaff } from "../../middleware/authMiddleware.js";
import { validateCreateSubject, validateUpdateSubject } from "../../validation/subject.js";

const router = express.Router();

// School subjects per class with a teacher per section. Teachers read them; only the owner changes them.
router.post("/create", verifyAuthToken, requireAdmin, validateCreateSubject, createSubject);
router.get("/", verifyAuthToken, requireStaff, getSubjects);
router.get("/mine", verifyAuthToken, requireStaff, getMySubjects);
router.patch("/:id", verifyAuthToken, requireAdmin, validateUpdateSubject, updateSubject);
router.delete("/:id", verifyAuthToken, requireAdmin, deleteSubject);

export default router;
