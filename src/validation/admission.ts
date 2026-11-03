import Joi from "joi";
import HttpStatus from "http-status-codes";
import { sendErrorResponse } from "../utilis/response.js";
import { enquirySources, enquiryStatuses } from "../model/admission/admission.js";

const optionalText = (max: number) => Joi.string().trim().max(max).allow("", null).optional();

const enquiryFieldsSchema = Joi.object({
  studentName: Joi.string().trim().max(60).required(),
  parentName: optionalText(60),
  countryCode: Joi.string().trim().default("+91"),
  phoneNumber: Joi.string().trim().pattern(/^[6-9]\d{9}$/).required().messages({ "string.pattern.base": "Phone number must be a valid 10-digit mobile number" }),
  email: Joi.string().trim().email().allow("", null).optional(),
  className: optionalText(60),
  previousSchool: optionalText(100),
  message: optionalText(1000),
  source: Joi.string().valid(...enquirySources).optional(),
  status: Joi.string().valid(...enquiryStatuses).optional(),
  enquiryDate: Joi.date().optional(),
  followUpDate: Joi.date().allow(null).optional(),
});

const createEnquirySchema = enquiryFieldsSchema.required();

const updateEnquirySchema = enquiryFieldsSchema
  .fork(["studentName", "phoneNumber"], (schema) => schema.optional())
  .fork(["countryCode"], (schema) => Joi.string().trim().optional())
  .min(1);

// The public website form: the visitor cannot set the status, source or dates.
const publicEnquirySchema = Joi.object({
  studentName: Joi.string().trim().max(60).required(),
  parentName: Joi.string().trim().max(60).required(),
  countryCode: Joi.string().trim().default("+91"),
  phoneNumber: Joi.string().trim().pattern(/^[6-9]\d{9}$/).required().messages({ "string.pattern.base": "Mobile number must be a valid 10-digit mobile number" }),
  email: Joi.string().trim().email().allow("", null).optional(),
  className: Joi.string().trim().max(60).required(),
  message: optionalText(500),
}).required();

const validateWithSchema = (schema, req, res, next) => {
  const { error, value } = schema.validate(req.body ?? {}, { abortEarly: false, stripUnknown: true });
  if (error) {
    return sendErrorResponse(res, error.details.map(({ message }) => message).join(", "), HttpStatus.BAD_REQUEST);
  }
  req.body = value;
  return next();
};

export const validateCreateEnquiry = (req, res, next) => validateWithSchema(createEnquirySchema, req, res, next);
export const validateUpdateEnquiry = (req, res, next) => validateWithSchema(updateEnquirySchema, req, res, next);
export const validatePublicEnquiry = (req, res, next) => validateWithSchema(publicEnquirySchema, req, res, next);
