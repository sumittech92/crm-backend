import express from "express";
import { createEntrance, getEntrances, getApplicants, updateEntrance, saveCandidates, deleteEntrance } from "../../controller/entrance/entranceController.js";
import { verifyAuthToken, requireAdmin } from "../../middleware/authMiddleware.js";
import { validateCreateEntrance, validateUpdateEntrance, validateEntranceCandidates } from "../../validation/entrance.js";

const router = express.Router();

// School admission entrance tests for primary classes. Owner only.
router.post("/create", verifyAuthToken, requireAdmin, validateCreateEntrance, createEntrance);
router.get("/", verifyAuthToken, requireAdmin, getEntrances);
router.get("/applicants", verifyAuthToken, requireAdmin, getApplicants);
router.put("/:id/candidates", verifyAuthToken, requireAdmin, validateEntranceCandidates, saveCandidates);
router.patch("/:id", verifyAuthToken, requireAdmin, validateUpdateEntrance, updateEntrance);
router.delete("/:id", verifyAuthToken, requireAdmin, deleteEntrance);

export default router;
