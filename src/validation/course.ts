import Joi from "joi";
import HttpStatus from "http-status-codes";
import { sendErrorResponse } from "../utilis/response.js";
import { courseStatuses, feeFrequencies } from "../model/teacher/courseModel.js";

const courseFieldsSchema = Joi.object({
  name: Joi.string().trim().max(80).required(),
  description: Joi.string().trim().max(1000).allow("", null).optional(),
  duration: Joi.string().trim().max(60).allow("", null).optional(),
  feeAmount: Joi.number().min(0).max(10000000).required(),
  feeFrequency: Joi.string().valid(...feeFrequencies).required(),
  subjects: Joi.array().items(Joi.string().trim().max(60)).max(30).default([]),
  status: Joi.string().valid(...courseStatuses).optional(),
});

const createCourseSchema = courseFieldsSchema.required();
const updateCourseSchema = courseFieldsSchema
  .fork(["name", "feeAmount", "feeFrequency"], (schema) => schema.optional())
  .fork(["subjects"], () => Joi.array().items(Joi.string().trim().max(60)).max(30).optional())
  .min(1);

const validateWithSchema = (schema, req, res, next) => {
  const { error, value } = schema.validate(req.body ?? {}, { abortEarly: false, stripUnknown: true });
  if (error) {
    return sendErrorResponse(res, error.details.map(({ message }) => message).join(", "), HttpStatus.BAD_REQUEST);
  }
  req.body = value;
  return next();
};

export const validateCreateCourse = (req, res, next) => validateWithSchema(createCourseSchema, req, res, next);
export const validateUpdateCourse = (req, res, next) => validateWithSchema(updateCourseSchema, req, res, next);
