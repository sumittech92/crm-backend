import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { AdmissionService } from "../../services/admission/admission.js";

// Admins only manage enquiries made to their own institute; super admins see every enquiry.
const ownerScope = (req) => req.role === "admin" ? { workType: req.userData.workType, adminId: req.userData._id } : {};

const handleError = (res, error, label) => {
  if (error.statusCode) return sendErrorResponse(res, error.message, error.statusCode);
  console.error(`${label}:`, error);
  return sendErrorResponse(res, "Something went wrong", HttpStatus.INTERNAL_SERVER_ERROR);
};

export const getPublicSite = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Website retrieved successfully", await AdmissionService.getPublicSite(req.params.siteSlug));
  } catch (error) { return handleError(res, error, "Public website lookup error"); }
};

export const submitPublicEnquiry = async (req, res) => {
  try {
    const { enquiry, updated } = await AdmissionService.submitPublicEnquiry(req.params.siteSlug, req.body);
    // Visitors only get the reference code back, never other enquiry details.
    return sendSuccessResponse(res, "Thank you! We will call you soon.", { enquiryCode: enquiry.enquiryCode, updated }, updated ? HttpStatus.OK : HttpStatus.CREATED);
  } catch (error) { return handleError(res, error, "Public enquiry error"); }
};

export const createEnquiry = async (req, res) => {
  try {
    if (req.role !== "admin") return sendErrorResponse(res, "Only an Owner can add enquiries", HttpStatus.FORBIDDEN);
    const { workType, adminId } = ownerScope(req);
    if (!workType) return sendErrorResponse(res, "Admin work type is not configured", HttpStatus.FORBIDDEN);
    return sendSuccessResponse(res, "Enquiry created successfully", await AdmissionService.createEnquiry(req.body, workType, adminId), HttpStatus.CREATED);
  } catch (error) { return handleError(res, error, "Enquiry creation error"); }
};

export const getEnquiries = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Enquiries retrieved successfully", await AdmissionService.getAllEnquiries(ownerScope(req), { status: req.query.status }));
  } catch (error) { return handleError(res, error, "Enquiry list error"); }
};

export const getEnquiry = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Enquiry retrieved successfully", await AdmissionService.getEnquiryById(req.params.enquiryId, ownerScope(req)));
  } catch (error) { return handleError(res, error, "Enquiry lookup error"); }
};

export const updateEnquiry = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Enquiry updated successfully", await AdmissionService.updateEnquiry(req.params.enquiryId, req.body, ownerScope(req)));
  } catch (error) { return handleError(res, error, "Enquiry update error"); }
};

export const deleteEnquiry = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Enquiry deleted successfully", await AdmissionService.deleteEnquiry(req.params.enquiryId, ownerScope(req)));
  } catch (error) { return handleError(res, error, "Enquiry deletion error"); }
};
