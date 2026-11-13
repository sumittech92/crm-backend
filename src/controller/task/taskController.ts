import HttpStatus from "http-status-codes";
import { sendSuccessResponse } from "../../utilis/response.js";
import { TaskService } from "../../services/task/task.js";
import { staffActor } from "../../utilis/staffAccess.js";
import { handleError } from "../../utilis/records.js";

const noun = (kind: unknown) => kind === "homework" ? "Homework" : "Assignment";

export const createTask = async (req, res) => {
  try {
    return sendSuccessResponse(res, `${noun(req.body.kind)} created successfully`, await TaskService.create(req.body, await staffActor(req)), HttpStatus.CREATED);
  } catch (error) { return handleError(res, error, "Task creation error"); }
};

// ?kind=homework|assignment
export const getTasks = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Retrieved successfully", await TaskService.list(await staffActor(req), { kind: req.query.kind }));
  } catch (error) { return handleError(res, error, "Task list error"); }
};

// Sections / batches and subjects the signed-in user may give work to (for the form).
export const getTaskOptions = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Options retrieved successfully", await TaskService.options(await staffActor(req)));
  } catch (error) { return handleError(res, error, "Task options error"); }
};

export const updateTask = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Updated successfully", await TaskService.update(req.params.id, req.body, await staffActor(req)));
  } catch (error) { return handleError(res, error, "Task update error"); }
};

export const deleteTask = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Deleted successfully", await TaskService.remove(req.params.id, await staffActor(req)));
  } catch (error) { return handleError(res, error, "Task deletion error"); }
};

// Teacher: students of the assignment's section / batch and what each submitted.
export const getTaskSubmissions = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Submissions retrieved successfully", await TaskService.submissions(req.params.id, await staffActor(req)));
  } catch (error) { return handleError(res, error, "Task submissions error"); }
};

export const reviewTaskSubmission = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Submission updated", await TaskService.review(req.params.id, req.params.studentCode, req.body, await staffActor(req)));
  } catch (error) { return handleError(res, error, "Task submission review error"); }
};
