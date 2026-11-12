import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { MaterialService } from "../../services/material/material.js";
import { staffActor } from "../../utilis/staffAccess.js";

const handleError = (res, error, label) => {
  if (error.statusCode) return sendErrorResponse(res, error.message, error.statusCode);
  console.error(`${label}:`, error);
  return sendErrorResponse(res, "Something went wrong", HttpStatus.INTERNAL_SERVER_ERROR);
};

export const createMaterial = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Material added successfully", await MaterialService.createMaterial(req.body, await staffActor(req)), HttpStatus.CREATED);
  } catch (error) { return handleError(res, error, "Material creation error"); }
};

export const getMaterials = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Materials retrieved successfully", await MaterialService.getAllMaterials(await staffActor(req), { status: req.query.status }));
  } catch (error) { return handleError(res, error, "Material list error"); }
};

export const getMaterial = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Material retrieved successfully", await MaterialService.getMaterial(req.params.materialId, await staffActor(req)));
  } catch (error) { return handleError(res, error, "Material lookup error"); }
};

export const updateMaterial = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Material updated successfully", await MaterialService.updateMaterial(req.params.materialId, req.body, await staffActor(req)));
  } catch (error) { return handleError(res, error, "Material update error"); }
};

export const deleteMaterial = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Material deleted successfully", await MaterialService.deleteMaterial(req.params.materialId, await staffActor(req)));
  } catch (error) { return handleError(res, error, "Material deletion error"); }
};
