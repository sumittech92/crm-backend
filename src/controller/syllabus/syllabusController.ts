import HttpStatus from "http-status-codes";
import { sendSuccessResponse } from "../../utilis/response.js";
import { SyllabusService } from "../../services/syllabus/syllabus.js";
import { staffActor } from "../../utilis/staffAccess.js";
import { handleError } from "../../utilis/records.js";

// Owners manage every syllabus; teachers the subjects they teach (add own chapters, tick chapters for their sections / batches).
export const getOverview = async (req, res) => {
  try { return sendSuccessResponse(res, "Syllabus progress retrieved successfully", await SyllabusService.overview(await staffActor(req))); }
  catch (error) { return handleError(res, error, "Syllabus overview error"); }
};
export const getSyllabi = async (req, res) => {
  try { return sendSuccessResponse(res, "Syllabi retrieved successfully", await SyllabusService.list(await staffActor(req))); }
  catch (error) { return handleError(res, error, "Syllabus list error"); }
};
export const getSyllabus = async (req, res) => {
  try { return sendSuccessResponse(res, "Syllabus retrieved successfully", await SyllabusService.get(req.params.id, await staffActor(req))); }
  catch (error) { return handleError(res, error, "Syllabus lookup error"); }
};
export const createSyllabus = async (req, res) => {
  try { return sendSuccessResponse(res, "Syllabus created successfully", await SyllabusService.create(req.body, await staffActor(req)), HttpStatus.CREATED); }
  catch (error) { return handleError(res, error, "Syllabus creation error"); }
};
export const updateSyllabus = async (req, res) => {
  try { return sendSuccessResponse(res, "Syllabus updated successfully", await SyllabusService.update(req.params.id, req.body, await staffActor(req))); }
  catch (error) { return handleError(res, error, "Syllabus update error"); }
};
export const deleteSyllabus = async (req, res) => {
  try { return sendSuccessResponse(res, "Syllabus deleted successfully", await SyllabusService.remove(req.params.id, await staffActor(req))); }
  catch (error) { return handleError(res, error, "Syllabus deletion error"); }
};
export const markChapter = async (req, res) => {
  try { return sendSuccessResponse(res, "Progress saved", await SyllabusService.mark(req.params.id, req.body, await staffActor(req))); }
  catch (error) { return handleError(res, error, "Syllabus progress error"); }
};
