import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { EventService } from "../../services/event/event.js";
import { resolveOwnerScope } from "../../utilis/ownerScope.js";
import { handleError } from "../../utilis/records.js";

export const createEvent = async (req, res) => {
  try {
    if (req.role !== "admin") return sendErrorResponse(res, "Only an Owner can add events", HttpStatus.FORBIDDEN);
    const { workType, adminId } = await resolveOwnerScope(req);
    if (!workType) return sendErrorResponse(res, "Admin work type is not configured", HttpStatus.FORBIDDEN);
    return sendSuccessResponse(res, "Event created successfully", await EventService.create(req.body, workType, adminId), HttpStatus.CREATED);
  } catch (error) { return handleError(res, error, "Event creation error"); }
};

export const getEvents = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Events retrieved successfully", await EventService.list(await resolveOwnerScope(req), req.query));
  } catch (error) { return handleError(res, error, "Event list error"); }
};

export const updateEvent = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Event updated successfully", await EventService.update(req.params.id, req.body, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Event update error"); }
};

export const deleteEvent = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Event deleted successfully", await EventService.remove(req.params.id, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Event deletion error"); }
};
