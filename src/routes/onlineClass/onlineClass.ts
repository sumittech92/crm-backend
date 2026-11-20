import express from "express";
import { getClasses, createClass, updateClass, deleteClass, startClass, completeClass, getAttendance } from "../../controller/onlineClass/onlineClassController.js";
import { verifyAuthToken, requireStaff } from "../../middleware/authMiddleware.js";
import { validateCreateClass, validateUpdateClass, validateCompleteClass } from "../../validation/onlineClass.js";

const router = express.Router();

// Live online classes on Google Meet. Owner manages all; teachers their own. Students use /portal/online-classes.
router.get("/", verifyAuthToken, requireStaff, getClasses);
router.post("/create", verifyAuthToken, requireStaff, validateCreateClass, createClass);
router.patch("/:id", verifyAuthToken, requireStaff, validateUpdateClass, updateClass);
router.delete("/:id", verifyAuthToken, requireStaff, deleteClass);
router.post("/:id/start", verifyAuthToken, requireStaff, startClass);
router.post("/:id/complete", verifyAuthToken, requireStaff, validateCompleteClass, completeClass);
router.get("/:id/attendance", verifyAuthToken, requireStaff, getAttendance);

export default router;
