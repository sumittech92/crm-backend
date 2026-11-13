import express from "express";
import { createTest, deleteTest, downloadAdmitCards, getAdmitCards, getMarks, getResults, getTest, getTests, publishResults, saveMarks, setAdmitAllowed, setStudentOptionalSubjects, unpublishResults, updateTest } from "../../controller/test/testController.js";
import { verifyAuthToken, requireStaff } from "../../middleware/authMiddleware.js";
import { validateAdmitAllow, validateAdmitDownload, validateCreateTest, validateMarks, validateOptionalSubjects, validateUpdateTest } from "../../validation/test.js";

const router = express.Router();

// Coaching tests / school exams and their marks. Owners manage all; teachers only their batches / sections (checked in the service).
router.post("/create", verifyAuthToken, requireStaff, validateCreateTest, createTest);
router.get("/", verifyAuthToken, requireStaff, getTests);
router.get("/results", verifyAuthToken, requireStaff, getResults);
router.get("/:testId", verifyAuthToken, requireStaff, getTest);
router.patch("/:testId", verifyAuthToken, requireStaff, validateUpdateTest, updateTest);
router.delete("/:testId", verifyAuthToken, requireStaff, deleteTest);
router.get("/:testId/marks", verifyAuthToken, requireStaff, getMarks);
router.put("/:testId/marks", verifyAuthToken, requireStaff, validateMarks, saveMarks);
router.post("/:testId/publish", verifyAuthToken, requireStaff, publishResults);
router.post("/:testId/unpublish", verifyAuthToken, requireStaff, unpublishResults);
// School admit cards: owner sees every student, a class teacher their sections (checked in the service).
router.get("/:testId/admit-cards", verifyAuthToken, requireStaff, getAdmitCards);
router.post("/:testId/admit-cards/allow", verifyAuthToken, requireStaff, validateAdmitAllow, setAdmitAllowed);
router.post("/:testId/admit-cards/download", verifyAuthToken, requireStaff, validateAdmitDownload, downloadAdmitCards);
router.put("/:testId/admit-cards/:studentCode/subjects", verifyAuthToken, requireStaff, validateOptionalSubjects, setStudentOptionalSubjects);

export default router;
