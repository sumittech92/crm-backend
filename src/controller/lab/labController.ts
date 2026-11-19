import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { LabService } from "../../services/lab/lab.js";
import { resolveOwnerScope } from "../../utilis/ownerScope.js";
import { handleError } from "../../utilis/records.js";

const ownerOnly = (req, res) => {
  if (req.role !== "admin") { sendErrorResponse(res, "Only an Owner can change labs", HttpStatus.FORBIDDEN); return false; }
  if (!req.userData.workType) { sendErrorResponse(res, "Admin work type is not configured", HttpStatus.FORBIDDEN); return false; }
  return true;
};
const run = (label: string, message: string, work: (req) => Promise<unknown>, { owner = true, status = HttpStatus.OK } = {}) => async (req, res) => {
  try {
    if (owner && !ownerOnly(req, res)) return;
    return sendSuccessResponse(res, message, await work(req), status);
  } catch (error) { return handleError(res, error, label); }
};

export const getLabs = run("Lab list error", "Labs retrieved successfully", async req => LabService.listLabs(await resolveOwnerScope(req)), { owner: false });
export const createLab = run("Lab creation error", "Lab created successfully", req => LabService.createLab(req.body, req.userData.workType, req.userData._id), { status: HttpStatus.CREATED });
export const updateLab = run("Lab update error", "Lab updated successfully", async req => LabService.updateLab(req.params.id, req.body, await resolveOwnerScope(req)));
export const deleteLab = run("Lab deletion error", "Lab deleted successfully", async req => LabService.removeLab(req.params.id, await resolveOwnerScope(req)));

export const getEquipment = run("Equipment list error", "Equipment retrieved successfully", async req => LabService.listEquipment(await resolveOwnerScope(req), req.query), { owner: false });
export const createEquipment = run("Equipment creation error", "Equipment added successfully", req => LabService.createEquipment(req.body, req.userData.workType, req.userData._id), { status: HttpStatus.CREATED });
export const updateEquipment = run("Equipment update error", "Equipment updated successfully", async req => LabService.updateEquipment(req.params.id, req.body, await resolveOwnerScope(req)));
export const deleteEquipment = run("Equipment deletion error", "Equipment deleted successfully", async req => LabService.removeEquipment(req.params.id, await resolveOwnerScope(req)));
