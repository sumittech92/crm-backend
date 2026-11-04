import express from "express";
import { collectFee, createFee, deleteFee, getFeeSummary, getFees, getStudentFees, updateFee } from "../../controller/fee/feeController.js";
import { verifyAuthToken, requireAdmin } from "../../middleware/authMiddleware.js";
import { validateCollectFee, validateCreateFee, validateUpdateFee } from "../../validation/fee.js";

const router = express.Router();

// Owners and super admins. Records are scoped to the owner in the controller.
router.get("/", verifyAuthToken, requireAdmin, getFees);
router.get("/summary", verifyAuthToken, requireAdmin, getFeeSummary);
router.get("/student/:studentId", verifyAuthToken, requireAdmin, getStudentFees);
router.post("/create", verifyAuthToken, requireAdmin, validateCreateFee, createFee);
router.post("/collect", verifyAuthToken, requireAdmin, validateCollectFee, collectFee);
router.patch("/:id", verifyAuthToken, requireAdmin, validateUpdateFee, updateFee);
router.delete("/:id", verifyAuthToken, requireAdmin, deleteFee);

export default router;
