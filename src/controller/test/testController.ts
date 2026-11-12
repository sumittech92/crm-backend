import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { TestService } from "../../services/test/test.js";
import { staffActor } from "../../utilis/staffAccess.js";

const handleError = (res, error, label) => {
  if (error.statusCode) return sendErrorResponse(res, error.message, error.statusCode);
  console.error(`${label}:`, error);
  return sendErrorResponse(res, "Something went wrong", HttpStatus.INTERNAL_SERVER_ERROR);
};

const actorFor = staffActor;

export const createTest = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Test scheduled successfully", await TestService.createTest(req.body, await actorFor(req)), HttpStatus.CREATED);
  } catch (error) { return handleError(res, error, "Test creation error"); }
};

export const getTests = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Tests retrieved successfully", await TestService.getAllTests(await actorFor(req)));
  } catch (error) { return handleError(res, error, "Test list error"); }
};

export const getResults = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Results retrieved successfully", await TestService.getResults(await actorFor(req), { status: req.query.status }));
  } catch (error) { return handleError(res, error, "Result list error"); }
};

export const getTest = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Test retrieved successfully", await TestService.getTest(req.params.testId, await actorFor(req)));
  } catch (error) { return handleError(res, error, "Test lookup error"); }
};

export const updateTest = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Test updated successfully", await TestService.updateTest(req.params.testId, req.body, await actorFor(req)));
  } catch (error) { return handleError(res, error, "Test update error"); }
};

export const deleteTest = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Test deleted successfully", await TestService.deleteTest(req.params.testId, await actorFor(req)));
  } catch (error) { return handleError(res, error, "Test deletion error"); }
};

export const getMarks = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Marks retrieved successfully", await TestService.getMarks(req.params.testId, String(req.query.paperId || ""), await actorFor(req)));
  } catch (error) { return handleError(res, error, "Marks lookup error"); }
};

export const saveMarks = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Marks saved successfully", await TestService.saveMarks(req.params.testId, req.body, await actorFor(req)));
  } catch (error) { return handleError(res, error, "Marks save error"); }
};

export const publishResults = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Results published", await TestService.setPublished(req.params.testId, true, await actorFor(req)));
  } catch (error) { return handleError(res, error, "Result publish error"); }
};

export const unpublishResults = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Results moved back to draft", await TestService.setPublished(req.params.testId, false, await actorFor(req)));
  } catch (error) { return handleError(res, error, "Result unpublish error"); }
};
