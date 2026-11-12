import express from "express";
import { createNotice, deleteNotice, getNotice, getNotices, updateNotice } from "../../controller/notice/noticeController.js";
import { verifyAuthToken, requireStaff } from "../../middleware/authMiddleware.js";
import { validateCreateNotice, validateUpdateNotice } from "../../validation/notice.js";

const router = express.Router();

// Notices. Owners manage all; teachers post to students of their own batches / sections (checked in the service).
router.post("/create", verifyAuthToken, requireStaff, validateCreateNotice, createNotice);
router.get("/", verifyAuthToken, requireStaff, getNotices);
router.get("/:noticeId", verifyAuthToken, requireStaff, getNotice);
router.patch("/:noticeId", verifyAuthToken, requireStaff, validateUpdateNotice, updateNotice);
router.delete("/:noticeId", verifyAuthToken, requireStaff, deleteNotice);

export default router;
