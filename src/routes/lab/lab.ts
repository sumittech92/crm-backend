import express from "express";
import { getLabs, createLab, updateLab, deleteLab, getEquipment, createEquipment, updateEquipment, deleteEquipment } from "../../controller/lab/labController.js";
import { verifyAuthToken, requireAdmin, requireStaff } from "../../middleware/authMiddleware.js";
import { validateCreateLab, validateUpdateLab, validateCreateEquipment, validateUpdateEquipment } from "../../validation/lab.js";

const router = express.Router();

// Labs and their equipment. Teachers can read them; only the owner changes them.
router.get("/equipment", verifyAuthToken, requireStaff, getEquipment);
router.post("/equipment/create", verifyAuthToken, requireAdmin, validateCreateEquipment, createEquipment);
router.patch("/equipment/:id", verifyAuthToken, requireAdmin, validateUpdateEquipment, updateEquipment);
router.delete("/equipment/:id", verifyAuthToken, requireAdmin, deleteEquipment);
router.get("/", verifyAuthToken, requireStaff, getLabs);
router.post("/create", verifyAuthToken, requireAdmin, validateCreateLab, createLab);
router.patch("/:id", verifyAuthToken, requireAdmin, validateUpdateLab, updateLab);
router.delete("/:id", verifyAuthToken, requireAdmin, deleteLab);

export default router;
