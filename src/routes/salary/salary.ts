import express from "express";
import { createSalary, getSalaries, updateSalary, deleteSalary, generateSalaries, getStructures, saveStructure, payAllSalaries } from "../../controller/salary/salaryController.js";
import { verifyAuthToken, requireAdmin } from "../../middleware/authMiddleware.js";
import { validateCreateSalary, validateUpdateSalary, validateGenerateSalary, validateSalaryStructure, validatePayAll } from "../../validation/salary.js";

const router = express.Router();

// Teacher salaries (payroll). Owner only.
router.post("/create", verifyAuthToken, requireAdmin, validateCreateSalary, createSalary);
router.post("/generate", verifyAuthToken, requireAdmin, validateGenerateSalary, generateSalaries);
router.get("/structures", verifyAuthToken, requireAdmin, getStructures);
router.put("/structures/:teacherCode", verifyAuthToken, requireAdmin, validateSalaryStructure, saveStructure);
router.post("/pay-all", verifyAuthToken, requireAdmin, validatePayAll, payAllSalaries);
router.get("/", verifyAuthToken, requireAdmin, getSalaries);
router.patch("/:id", verifyAuthToken, requireAdmin, validateUpdateSalary, updateSalary);
router.delete("/:id", verifyAuthToken, requireAdmin, deleteSalary);

export default router;
