import express from "express";
import {
  getSummary, getWorkspaces, getWorkspace, updateWorkspace, setWorkspaceStatus,
  getSubscriptions, createSubscription, updateSubscription, renewSubscription, deleteSubscription, getSettings, updateSettings,
} from "../../controller/platform/platformController.js";
import { verifyAuthToken, requireSuperAdmin } from "../../middleware/authMiddleware.js";
import {
  validateUpdateWorkspace, validateWorkspaceStatus, validateCreateSubscription, validateUpdateSubscription, validateRenewSubscription, validatePlatformSettings,
} from "../../validation/platform.js";

const router = express.Router();

// Super Admin panel: workspaces (owner accounts), subscriptions, settings, dashboard / reports.
router.use(verifyAuthToken, requireSuperAdmin);
router.get("/summary", getSummary);
router.get("/workspaces", getWorkspaces);
router.get("/workspaces/:id", getWorkspace);
router.patch("/workspaces/:id", validateUpdateWorkspace, updateWorkspace);
router.patch("/workspaces/:id/status", validateWorkspaceStatus, setWorkspaceStatus);
router.get("/subscriptions", getSubscriptions);
router.post("/subscriptions/create", validateCreateSubscription, createSubscription);
router.patch("/subscriptions/:id", validateUpdateSubscription, updateSubscription);
router.post("/subscriptions/:id/renew", validateRenewSubscription, renewSubscription);
router.delete("/subscriptions/:id", deleteSubscription);
router.get("/settings", getSettings);
router.put("/settings", validatePlatformSettings, updateSettings);

export default router;
