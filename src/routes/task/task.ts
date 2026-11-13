import express from "express";
import { createTask, deleteTask, getTaskOptions, getTaskSubmissions, getTasks, reviewTaskSubmission, updateTask } from "../../controller/task/taskController.js";
import { verifyAuthToken, requireStaff } from "../../middleware/authMiddleware.js";
import { validateCreateTask, validateReviewSubmission, validateUpdateTask } from "../../validation/task.js";

const router = express.Router();

// Homework and assignments. Teachers give them to their own sections / batches and manage only their own; owners manage all.
router.post("/create", verifyAuthToken, requireStaff, validateCreateTask, createTask);
router.get("/", verifyAuthToken, requireStaff, getTasks);
router.get("/options", verifyAuthToken, requireStaff, getTaskOptions);
router.get("/:id/submissions", verifyAuthToken, requireStaff, getTaskSubmissions);
router.patch("/:id/submissions/:studentCode", verifyAuthToken, requireStaff, validateReviewSubmission, reviewTaskSubmission);
router.patch("/:id", verifyAuthToken, requireStaff, validateUpdateTask, updateTask);
router.delete("/:id", verifyAuthToken, requireStaff, deleteTask);

export default router;
