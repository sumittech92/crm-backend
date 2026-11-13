import express from "express";
import * as portal from "../../controller/portal/portalController.js";
import { verifyAuthToken } from "../../middleware/authMiddleware.js";
import { validateFeeSubmission, validateTaskSubmission } from "../../validation/portal.js";
import { validateOptionalSubjects } from "../../validation/test.js";

const router = express.Router();

// Student / parent portal: each route reads only the signed-in student's own data (a parent picks a child with ?student=<code>).
const requirePortalUser = (req, res, next) => ["student", "parent"].includes(req.role) ? next() : res.status(403).json({ auth: false, message: "Student or parent access required" });
const guard = [verifyAuthToken, requirePortalUser];

router.get("/me", ...guard, portal.getMe);
router.get("/class", ...guard, portal.getClass);
router.get("/subjects", ...guard, portal.getSubjects);
router.get("/timetable", ...guard, portal.getTimetable);
router.get("/attendance", ...guard, portal.getAttendance);
router.get("/fees", ...guard, portal.getFees);
router.post("/fees/submissions", ...guard, validateFeeSubmission, portal.submitFee);
router.get("/tests", ...guard, portal.getTests);
router.post("/tests/:testCode/admit-card", ...guard, portal.downloadAdmitCard);
router.get("/optional-subjects", ...guard, portal.getOptionalSubjects);
router.put("/optional-subjects", ...guard, validateOptionalSubjects, portal.setOptionalSubjects);
router.get("/results", ...guard, portal.getResults);
router.get("/materials", ...guard, portal.getMaterials);
router.get("/notices", ...guard, portal.getNotices);
router.get("/updates", ...guard, portal.getUpdates);
router.get("/tasks", ...guard, portal.getTasks);
router.get("/syllabus", ...guard, portal.getSyllabus);
router.post("/tasks/:taskCode/submission", ...guard, validateTaskSubmission, portal.submitTask);

export default router;
