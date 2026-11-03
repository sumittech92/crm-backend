import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { WebsiteService } from "../../services/website/website.js";
import { AuthClass } from "../../services/Auth/auth.js";

const handleError = (res, error, label) => {
  if (error.statusCode) return sendErrorResponse(res, error.message, error.statusCode);
  console.error(`${label}:`, error);
  return sendErrorResponse(res, "Something went wrong", HttpStatus.INTERNAL_SERVER_ERROR);
};

export const getMyWebsite = async (req, res) => {
  try {
    const siteSlug = await AuthClass.ensureSiteSlug(req.userData);
    return sendSuccessResponse(res, "Website retrieved successfully", await WebsiteService.getMine({ ...req.userData, siteSlug }));
  } catch (error) { return handleError(res, error, "Website lookup error"); }
};

export const saveMyWebsite = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Website saved successfully", await WebsiteService.saveMine(req.userData, req.body));
  } catch (error) { return handleError(res, error, "Website save error"); }
};

export const publishMyWebsite = async (req, res) => {
  try {
    const website = await WebsiteService.setPublished(req.userData._id, req.body.isPublished);
    return sendSuccessResponse(res, website.isPublished ? "Website published" : "Website hidden", website);
  } catch (error) { return handleError(res, error, "Website publish error"); }
};

export const getMyInstituteWebsite = async (req, res) => {
  try {
    if (req.role !== "teacher" && req.role !== "student") return sendErrorResponse(res, "Only teachers and students have an institute website", HttpStatus.FORBIDDEN);
    return sendSuccessResponse(res, "Website retrieved successfully", await WebsiteService.getForMember(req.userData));
  } catch (error) { return handleError(res, error, "Institute website error"); }
};

export const getPublicWebsite = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Website retrieved successfully", await WebsiteService.getPublic(req.params.siteSlug));
  } catch (error) { return handleError(res, error, "Public website error"); }
};

export const getDirectory = async (_req, res) => {
  try {
    return sendSuccessResponse(res, "Websites retrieved successfully", await WebsiteService.directory());
  } catch (error) { return handleError(res, error, "Website directory error"); }
};

export const getWebsiteByDomain = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Website retrieved successfully", await WebsiteService.findByDomain(String(req.query.host ?? "")));
  } catch (error) { return handleError(res, error, "Website domain lookup error"); }
};
