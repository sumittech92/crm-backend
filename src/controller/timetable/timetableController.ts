import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { TimetableService } from "../../services/timetable/timetable.js";
import { resolveOwnerScope } from "../../utilis/ownerScope.js";
import { handleError } from "../../utilis/records.js";
import { staffActor } from "../../utilis/staffAccess.js";

export const createPeriod = async (req, res) => {
  try {
    if (req.role !== "admin") return sendErrorResponse(res, "Only an Owner can add timetable periods", HttpStatus.FORBIDDEN);
    const { workType, adminId } = await resolveOwnerScope(req);
    if (!workType) return sendErrorResponse(res, "Admin work type is not configured", HttpStatus.FORBIDDEN);
    return sendSuccessResponse(res, "Period created successfully", await TimetableService.create(req.body, workType, adminId), HttpStatus.CREATED);
  } catch (error) { return handleError(res, error, "Period creation error"); }
};

export const getPeriods = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Periods retrieved successfully", await TimetableService.list(await resolveOwnerScope(req), req.query));
  } catch (error) { return handleError(res, error, "Period list error"); }
};

export const updatePeriod = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Period updated successfully", await TimetableService.update(req.params.id, req.body, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Period update error"); }
};

export const deletePeriod = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Period deleted successfully", await TimetableService.remove(req.params.id, await resolveOwnerScope(req)));
  } catch (error) { return handleError(res, error, "Period deletion error"); }
};

// Today's periods (school) or batches meeting today (coaching); teachers see their own.
export const getToday = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Today's classes retrieved successfully", await TimetableService.today(await staffActor(req)));
  } catch (error) { return handleError(res, error, "Today's classes error"); }
};

// Teacher: sections they teach or are class teacher of (school), or their batches (coaching).
export const getMyClasses = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Classes retrieved successfully", await TimetableService.myClasses(await staffActor(req)));
  } catch (error) { return handleError(res, error, "My classes error"); }
};
