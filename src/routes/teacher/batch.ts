import express from "express";
import { createBatch, getAllBatches, getBatchById, updateBatch, deleteBatch } from "../../controller/teacher/batchController.js";
import { verifyAuthToken, requireAdmin, requireMatchingWorkType } from "../../middleware/authMiddleware.js";

const router = express.Router();
////////////
router.post("/create", verifyAuthToken, requireAdmin, requireMatchingWorkType, createBatch);
router.get("/", verifyAuthToken, requireAdmin, requireMatchingWorkType, getAllBatches);
router.get("/:id", verifyAuthToken, requireAdmin, requireMatchingWorkType, getBatchById);
router.patch("/:id", verifyAuthToken, requireAdmin, requireMatchingWorkType, updateBatch);
router.delete("/:id", verifyAuthToken, requireAdmin, requireMatchingWorkType, deleteBatch);

export default router;
