import express from "express";
import { createSalary, getSalaries, updateSalary, deleteSalary, generateSalaries } from "../../controller/salary/salaryController.js";
import { verifyAuthToken, requireAdmin } from "../../middleware/authMiddleware.js";
import { validateCreateSalary, validateUpdateSalary, validateGenerateSalary } from "../../validation/salary.js";

const router = express.Router();

// Teacher salaries (payroll). Owner only.
router.post("/create", verifyAuthToken, requireAdmin, validateCreateSalary, createSalary);
router.post("/generate", verifyAuthToken, requireAdmin, validateGenerateSalary, generateSalaries);
router.get("/", verifyAuthToken, requireAdmin, getSalaries);
router.patch("/:id", verifyAuthToken, requireAdmin, validateUpdateSalary, updateSalary);
router.delete("/:id", verifyAuthToken, requireAdmin, deleteSalary);

export default router;
