import Joi from "joi";
import HttpStatus from "http-status-codes";
import { sendErrorResponse } from "../utilis/response.js";

const studentFieldsSchema = Joi.object({
  fullName: Joi.string().trim().required(),
  email: Joi.string().trim().email().required(),
  countryCode: Joi.string().trim().required(),
  phoneNumber: Joi.string().trim().required(),
  password: Joi.string().min(8).required(),
  profileImage: Joi.string().allow("", null).optional(),
  gender: Joi.string().valid("male", "female", "other").allow(null).optional(),
  dateOfBirth: Joi.date().max("now").allow(null).optional().messages({ "date.max": "Date of birth cannot be in the future" }),
  status: Joi.string().valid("active", "inactive").optional(),
  // Parent login on the parent mobile: enabled = has a login; password sets / changes it (required for a new parent account).
  parentLogin: Joi.object({
    enabled: Joi.boolean().required(),
    password: Joi.string().min(8).max(64).allow("", null).optional(),
  }).optional(),
  feePlan: Joi.object({
    amount: Joi.number().min(0).max(10000000).allow(null).optional(),
    discount: Joi.number().min(0).max(10000000).optional(),
  }).optional(),
  parentsInfo: Joi.object({
    fatherName: Joi.string().trim().allow("", null).optional(),
    motherName: Joi.string().trim().allow("", null).optional(),
    countryCode: Joi.string().trim().allow("", null).optional(),
    phoneNumber: Joi.string().trim().allow("", null).optional(),
  }).optional(),
  address: Joi.object({
    addressLine: Joi.string().trim().allow("", null).optional(),
    city: Joi.string().trim().allow("", null).optional(),
    state: Joi.string().trim().allow("", null).optional(),
    pincode: Joi.string().trim().allow("", null).optional(),
  }).optional(),
  schoolInfo: Joi.object({
    schoolName: Joi.string().trim().allow("", null).optional(),
    board: Joi.string().trim().allow("", null).optional(),
    className: Joi.string().trim().allow("", null).optional(),
    section: Joi.string().trim().allow("", null).optional(),
    admissionDate: Joi.date().allow(null).optional(),
    rollNumber: Joi.string().trim().allow("", null).optional(),
    currentTerm: Joi.string().trim().allow("", null).optional(),
    admissionCategory: Joi.string().trim().allow("", null).optional(),
  }).optional(),
  coachingInfo: Joi.object({
    coachingName: Joi.string().trim().allow("", null).optional(),
    className: Joi.string().trim().allow("", null).optional(),
    course: Joi.string().trim().allow("", null).optional(),
    batchTiming: Joi.string().trim().allow("", null).optional(),
    admissionDate: Joi.date().allow(null).optional(),
    schoolName: Joi.string().trim().allow("", null).optional(),
    board: Joi.string().trim().allow("", null).optional(),
  }).optional(),
});

const createStudentSchema = studentFieldsSchema.xor("schoolInfo", "coachingInfo").required();

const updateStudentSchema = studentFieldsSchema
  .fork(["fullName", "email", "countryCode", "phoneNumber", "password"], (schema) => schema.optional())
  // Optional on update: the owner sets a new login password.
  .fork(["password"], () => Joi.string().min(8).max(64).optional())
  .min(1);

const validateWithSchema = (schema, req, res, next) => {
  const { error, value } = schema.validate(req.body ?? {}, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    return sendErrorResponse(
      res,
      error.details.map(({ message }) => message).join(", "),
      HttpStatus.BAD_REQUEST,
    );
  }
  req.body = value;
  return next();
};

export const validateCreateStudent = (req, res, next) => {
  return validateWithSchema(createStudentSchema, req, res, next);
};

export const validateUpdateStudent = (req, res, next) =>
  validateWithSchema(updateStudentSchema, req, res, next);
