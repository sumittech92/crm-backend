import express from "express";
import { createBatch, getAllBatches, getBatchById, updateBatch, deleteBatch } from "../../controller/teacher/batchController.js";
import { verifyAuthToken, requireAdmin, requireStaff } from "../../middleware/authMiddleware.js";
import { validateCreateBatch, validateUpdateBatch } from "../../validation/batch.js";

const router = express.Router();

// Coaching batches / school sections. Teachers can read them; only the owner changes them.
router.post("/create", verifyAuthToken, requireAdmin, validateCreateBatch, createBatch);
router.get("/", verifyAuthToken, requireStaff, getAllBatches);
router.get("/:batchId", verifyAuthToken, requireStaff, getBatchById);
router.patch("/:batchId", verifyAuthToken, requireAdmin, validateUpdateBatch, updateBatch);
router.delete("/:batchId", verifyAuthToken, requireAdmin, deleteBatch);

export default router;
