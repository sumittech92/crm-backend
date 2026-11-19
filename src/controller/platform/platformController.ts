import HttpStatus from "http-status-codes";
import { sendSuccessResponse } from "../../utilis/response.js";
import { PlatformService } from "../../services/platform/platform.js";
import { handleError } from "../../utilis/records.js";

const run = (label: string, message: string, work: (req) => Promise<unknown>, status = HttpStatus.OK) => async (req, res) => {
  try { return sendSuccessResponse(res, message, await work(req), status); } catch (error) { return handleError(res, error, label); }
};

export const getSummary = run("Platform summary error", "Platform summary retrieved", () => PlatformService.summary());
export const getWorkspaces = run("Workspace list error", "Workspaces retrieved", req => PlatformService.workspaces(req.query));
export const getWorkspace = run("Workspace lookup error", "Workspace retrieved", req => PlatformService.workspace(req.params.id));
export const updateWorkspace = run("Workspace update error", "Workspace updated", req => PlatformService.updateWorkspace(req.params.id, req.body));
export const setWorkspaceStatus = run("Workspace status error", "Workspace status saved", req => PlatformService.setActive(req.params.id, req.body.active));

export const getSubscriptions = run("Subscription list error", "Subscriptions retrieved", () => PlatformService.subscriptions());
export const createSubscription = run("Subscription creation error", "Subscription created", req => PlatformService.createSubscription(req.body), HttpStatus.CREATED);
export const updateSubscription = run("Subscription update error", "Subscription updated", req => PlatformService.updateSubscription(req.params.id, req.body));
export const renewSubscription = run("Subscription renewal error", "Subscription renewed", req => PlatformService.renewSubscription(req.params.id, req.body));
export const deleteSubscription = run("Subscription deletion error", "Subscription deleted", req => PlatformService.removeSubscription(req.params.id));

export const getSettings = run("Platform settings error", "Settings retrieved", () => PlatformService.settings());
export const updateSettings = run("Platform settings update error", "Settings saved", req => PlatformService.updateSettings(req.body));
