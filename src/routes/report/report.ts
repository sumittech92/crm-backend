import express from "express";
import { getDashboard, getReport } from "../../controller/report/reportController.js";
import { verifyAuthToken, requireOwner, requireStaff } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/dashboard/summary", verifyAuthToken, requireStaff, getDashboard);
router.get("/:type", verifyAuthToken, requireOwner, getReport);

export default router;
