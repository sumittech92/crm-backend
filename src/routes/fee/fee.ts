import express from "express";
import { approveSubmission, collectFee, createFee, deleteFee, getFeeSettings, getFeeSummary, getFees, getStudentFees, getSubmissions, rejectSubmission, saveFeeSettings, updateFee } from "../../controller/fee/feeController.js";
import { verifyAuthToken, requireAdmin, requireOwner } from "../../middleware/authMiddleware.js";
import { validateCollectFee, validateCreateFee, validateFeeSettings, validateRejectSubmission, validateUpdateFee } from "../../validation/fee.js";

const router = express.Router();

// Owners and super admins. Records are scoped to the owner in the controller.
router.get("/", verifyAuthToken, requireAdmin, getFees);
router.get("/summary", verifyAuthToken, requireAdmin, getFeeSummary);
router.get("/student/:studentId", verifyAuthToken, requireAdmin, getStudentFees);
router.post("/create", verifyAuthToken, requireAdmin, validateCreateFee, createFee);
router.post("/collect", verifyAuthToken, requireAdmin, validateCollectFee, collectFee);
// Payments students / parents report from the portal, and the payment details shown to them.
router.get("/submissions", verifyAuthToken, requireAdmin, getSubmissions);
router.post("/submissions/:id/approve", verifyAuthToken, requireAdmin, approveSubmission);
router.post("/submissions/:id/reject", verifyAuthToken, requireAdmin, validateRejectSubmission, rejectSubmission);
router.get("/settings", verifyAuthToken, requireAdmin, getFeeSettings);
router.put("/settings", verifyAuthToken, requireOwner, validateFeeSettings, saveFeeSettings);
router.patch("/:id", verifyAuthToken, requireAdmin, validateUpdateFee, updateFee);
router.delete("/:id", verifyAuthToken, requireAdmin, deleteFee);

export default router;
