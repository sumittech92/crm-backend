import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { SalaryService } from "../../services/salary/salary.js";
import { resolveOwnerScope } from "../../utilis/ownerScope.js";
import { handleError } from "../../utilis/records.js";

const ownerOnly = (req, res) => {
  if (req.role !== "admin") { sendErrorResponse(res, "Only an Owner can manage salaries", HttpStatus.FORBIDDEN); return false; }
  if (!req.userData.workType) { sendErrorResponse(res, "Admin work type is not configured", HttpStatus.FORBIDDEN); return false; }
  return true;
};

export const createSalary = async (req, res) => {
  try {
    if (!ownerOnly(req, res)) return;
    return sendSuccessResponse(res, "Salary added successfully", await SalaryService.create(req.body, req.userData.workType, req.userData._id), HttpStatus.CREATED);
  } catch (error) { return handleError(res, error, "Salary creation error"); }
};

export const getSalaries = async (req, res) => {
  try {
    if (!ownerOnly(req, res)) return;
    return sendSuccessResponse(res, "Salaries retrieved successfully", await SalaryService.list(await resolveOwnerScope(req), req.query));
  } catch (error) { return handleError(res, error, "Salary list error"); }
};

export const updateSalary = async (req, res) => {
  try {
    if (!ownerOnly(req, res)) return;
    return sendSuccessResponse(res, "Salary updated successfully", await SalaryService.update(req.params.id, req.body, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Salary update error"); }
};

export const deleteSalary = async (req, res) => {
  try {
    if (!ownerOnly(req, res)) return;
    return sendSuccessResponse(res, "Salary deleted successfully", await SalaryService.remove(req.params.id, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Salary deletion error"); }
};

export const generateSalaries = async (req, res) => {
  try {
    if (!ownerOnly(req, res)) return;
    return sendSuccessResponse(res, "Salaries generated successfully", await SalaryService.generate(req.body.month, req.userData.workType, req.userData._id));
  } catch (error) { return handleError(res, error, "Salary generation error"); }
};

export const getStructures = async (req, res) => {
  try {
    if (!ownerOnly(req, res)) return;
    return sendSuccessResponse(res, "Salary setup retrieved successfully", await SalaryService.structures(req.userData.workType, req.userData._id));
  } catch (error) { return handleError(res, error, "Salary setup list error"); }
};

export const saveStructure = async (req, res) => {
  try {
    if (!ownerOnly(req, res)) return;
    return sendSuccessResponse(res, "Salary setup saved successfully", await SalaryService.saveStructure(req.params.teacherCode, req.body, req.userData.workType, req.userData._id));
  } catch (error) { return handleError(res, error, "Salary setup save error"); }
};

export const payAllSalaries = async (req, res) => {
  try {
    if (!ownerOnly(req, res)) return;
    return sendSuccessResponse(res, "Salaries marked as paid", await SalaryService.payAll(req.body, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Salary pay-all error"); }
};
