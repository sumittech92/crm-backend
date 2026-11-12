import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { NoticeService } from "../../services/notice/notice.js";
import { staffActor } from "../../utilis/staffAccess.js";

const handleError = (res, error, label) => {
  if (error.statusCode) return sendErrorResponse(res, error.message, error.statusCode);
  console.error(`${label}:`, error);
  return sendErrorResponse(res, "Something went wrong", HttpStatus.INTERNAL_SERVER_ERROR);
};

export const createNotice = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Notice posted successfully", await NoticeService.createNotice(req.body, await staffActor(req)), HttpStatus.CREATED);
  } catch (error) { return handleError(res, error, "Notice creation error"); }
};

export const getNotices = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Notices retrieved successfully", await NoticeService.getAllNotices(await staffActor(req)));
  } catch (error) { return handleError(res, error, "Notice list error"); }
};

export const getNotice = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Notice retrieved successfully", await NoticeService.getNotice(req.params.noticeId, await staffActor(req)));
  } catch (error) { return handleError(res, error, "Notice lookup error"); }
};

export const updateNotice = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Notice updated successfully", await NoticeService.updateNotice(req.params.noticeId, req.body, await staffActor(req)));
  } catch (error) { return handleError(res, error, "Notice update error"); }
};

export const deleteNotice = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Notice deleted successfully", await NoticeService.deleteNotice(req.params.noticeId, await staffActor(req)));
  } catch (error) { return handleError(res, error, "Notice deletion error"); }
};
