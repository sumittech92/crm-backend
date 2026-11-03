import express from "express";
import { createEnquiry, deleteEnquiry, getEnquiries, getEnquiry, getPublicSite, submitPublicEnquiry, updateEnquiry } from "../../controller/admission/admissionController.js";
import { verifyAuthToken, requireAdmin } from "../../middleware/authMiddleware.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { validateCreateEnquiry, validatePublicEnquiry, validateUpdateEnquiry } from "../../validation/admission.js";

const router = express.Router();
const publicEnquiryLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, message: "Too many enquiries from this device. Please try again in a few minutes." });

// Public website (no sign-in): institute name / work type and the enquiry form.
router.get("/public/:siteSlug", getPublicSite);
router.post("/public/:siteSlug/enquiry", publicEnquiryLimit, validatePublicEnquiry, submitPublicEnquiry);

router.post("/create", verifyAuthToken, requireAdmin, validateCreateEnquiry, createEnquiry);
router.get("/", verifyAuthToken, requireAdmin, getEnquiries);
router.get("/:enquiryId", verifyAuthToken, requireAdmin, getEnquiry);
router.patch("/:enquiryId", verifyAuthToken, requireAdmin, validateUpdateEnquiry, updateEnquiry);
router.delete("/:enquiryId", verifyAuthToken, requireAdmin, deleteEnquiry);

export default router;
