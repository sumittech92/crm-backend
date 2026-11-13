import express from "express";
import { createSession, getSessions, updateSession, deleteSession } from "../../controller/session/sessionController.js";
import { verifyAuthToken, requireAdmin, requireStaff } from "../../middleware/authMiddleware.js";
import { validateCreateSession, validateUpdateSession } from "../../validation/session.js";

const router = express.Router();

// Academic sessions. Teachers can read them; only the owner changes them.
router.post("/create", verifyAuthToken, requireAdmin, validateCreateSession, createSession);
router.get("/", verifyAuthToken, requireStaff, getSessions);
router.patch("/:id", verifyAuthToken, requireAdmin, validateUpdateSession, updateSession);
router.delete("/:id", verifyAuthToken, requireAdmin, deleteSession);

export default router;
