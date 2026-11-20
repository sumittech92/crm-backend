import express from "express";
import { getPaperOptions, getPapers, generatePaper, downloadPaper } from "../../controller/mockPaper/mockPaperController.js";
import { verifyAuthToken, requireStaff } from "../../middleware/authMiddleware.js";
import { validateGeneratePaper } from "../../validation/mockPaper.js";

const router = express.Router();

// Mock test papers (school, Classes 9–12) for the owner and teachers. Students use /portal/mock-papers.
router.get("/options", verifyAuthToken, requireStaff, getPaperOptions);
router.get("/", verifyAuthToken, requireStaff, getPapers);
router.post("/generate", verifyAuthToken, requireStaff, validateGeneratePaper, generatePaper);
router.post("/:id/download", verifyAuthToken, requireStaff, downloadPaper);

export default router;
