import Joi from "joi";
import HttpStatus from "http-status-codes";
import { sendErrorResponse } from "../utilis/response.js";

const schoolInfoSchema = Joi.object({
  designation: Joi.string().trim().allow("", null).optional(),

  department: Joi.string().trim().allow("", null).optional(),

  qualification: Joi.array()
    .items(Joi.string().trim())
    .default([]),

  subjects: Joi.array()
    .items(Joi.string().trim())
    .default([]),

  classesTaught: Joi.array()
    .items(Joi.string().trim())
    .default([]),
});

const coachingInfoSchema = Joi.object({
  qualification: Joi.array()
    .items(Joi.string().trim())
    .default([]),

  experience: Joi.number()
    .min(0)
    .allow(null)
    .optional(),

  subjects: Joi.array()
    .items(Joi.string().trim())
    .default([]),

  classesTaught: Joi.array()
    .items(Joi.string().trim())
    .default([]),
});

const teacherFieldsSchema = Joi.object({
  fullName: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().trim().email().lowercase().required(),
  password: Joi.string().min(8).required(),

  countryCode: Joi.string().trim().pattern(/^\+[1-9]\d{0,3}$/).required(),

  phoneNumber: Joi.string().trim().pattern(/^\d{7,15}$/).required(),

  joiningDate: Joi.date().iso().allow(null).optional(),

  status: Joi.string()
    .valid("active", "inactive", "pending", "onLeave")
    .optional(),

  profileImage: Joi.string().trim().allow(null, "").optional(),

  gender: Joi.string()
    .valid("male", "female")
    .allow(null)
    .optional(),

  schoolInfo: schoolInfoSchema.optional(),

  coachingInfo: coachingInfoSchema.optional(),
});

export const createTeacherValidator = teacherFieldsSchema
  .fork(["status"], (schema) => schema.default("pending"))
  .xor("schoolInfo", "coachingInfo")
  .messages({
    "object.missing":
      "Exactly one of schoolInfo or coachingInfo is required",
    "object.xor":
      "Exactly one of schoolInfo or coachingInfo is required",
  });

// Same fields as create, all optional; the password is only set at creation.
const updateTeacherValidator = teacherFieldsSchema
  .fork(["fullName", "email", "countryCode", "phoneNumber"], (schema) => schema.optional())
  // Optional on update: the owner sets a new login password.
  .fork(["password"], () => Joi.string().min(8).max(64).optional())
  .oxor("schoolInfo", "coachingInfo")
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

export const validateCreateTeacher = (req, res, next) =>
  validateWithSchema(createTeacherValidator, req, res, next);

export const validateUpdateTeacher = (req, res, next) =>
  validateWithSchema(updateTeacherValidator, req, res, next);
