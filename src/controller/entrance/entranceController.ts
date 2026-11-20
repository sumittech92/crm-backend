import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { EntranceService } from "../../services/entrance/entrance.js";
import { resolveOwnerScope } from "../../utilis/ownerScope.js";
import { handleError } from "../../utilis/records.js";

/** Entrance tests are managed by the owner (school or coaching). */
const schoolOwner = (req, res) => {
  if (req.role !== "admin") { sendErrorResponse(res, "Only an Owner can manage entrance tests", HttpStatus.FORBIDDEN); return false; }
  if (!req.userData.workType) { sendErrorResponse(res, "Admin work type is not configured", HttpStatus.FORBIDDEN); return false; }
  return true;
};

export const createEntrance = async (req, res) => {
  try {
    if (!schoolOwner(req, res)) return;
    return sendSuccessResponse(res, "Entrance test created successfully", await EntranceService.create(req.body, req.userData.workType, req.userData._id), HttpStatus.CREATED);
  } catch (error) { return handleError(res, error, "Entrance test creation error"); }
};

export const getEntrances = async (req, res) => {
  try {
    if (!schoolOwner(req, res)) return;
    return sendSuccessResponse(res, "Entrance tests retrieved successfully", await EntranceService.list(await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Entrance test list error"); }
};

export const getApplicants = async (req, res) => {
  try {
    if (!schoolOwner(req, res)) return;
    return sendSuccessResponse(res, "Applicants retrieved successfully", await EntranceService.applicants(await resolveOwnerScope(req), String(req.query.className || "")));
  } catch (error) { return handleError(res, error, "Entrance applicant list error"); }
};

export const updateEntrance = async (req, res) => {
  try {
    if (!schoolOwner(req, res)) return;
    return sendSuccessResponse(res, "Entrance test updated successfully", await EntranceService.update(req.params.id, req.body, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Entrance test update error"); }
};

export const saveCandidates = async (req, res) => {
  try {
    if (!schoolOwner(req, res)) return;
    return sendSuccessResponse(res, "Candidates saved successfully", await EntranceService.saveCandidates(req.params.id, req.body.candidates, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Entrance candidates error"); }
};

export const deleteEntrance = async (req, res) => {
  try {
    if (!schoolOwner(req, res)) return;
    return sendSuccessResponse(res, "Entrance test deleted successfully", await EntranceService.remove(req.params.id, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Entrance test deletion error"); }
};
