import express from "express";
import { createMaterial, deleteMaterial, getMaterial, getMaterials, updateMaterial } from "../../controller/material/materialController.js";
import { verifyAuthToken, requireStaff } from "../../middleware/authMiddleware.js";
import { validateCreateMaterial, validateUpdateMaterial } from "../../validation/material.js";

const router = express.Router();

// Study materials. Owners manage all; teachers their batches / sections (school: also their subjects), checked in the service.
router.post("/create", verifyAuthToken, requireStaff, validateCreateMaterial, createMaterial);
router.get("/", verifyAuthToken, requireStaff, getMaterials);
router.get("/:materialId", verifyAuthToken, requireStaff, getMaterial);
router.patch("/:materialId", verifyAuthToken, requireStaff, validateUpdateMaterial, updateMaterial);
router.delete("/:materialId", verifyAuthToken, requireStaff, deleteMaterial);

export default router;
