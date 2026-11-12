import Joi from "joi";
import HttpStatus from "http-status-codes";
import { sendErrorResponse } from "../utilis/response.js";
import { batchDays, batchStatuses } from "../model/teacher/batchModel.js";

const time = Joi.string().trim().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).allow(null).messages({ "string.pattern.base": "Time must be HH:mm (24-hour)" });
const day = Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).allow("", null).messages({ "string.pattern.base": "Dates must be YYYY-MM-DD" });

// Course and teachers are sent as their 6-digit codes (or MongoDB ids).
const batchFieldsSchema = Joi.object({
  courseCode: Joi.string().trim().required(),
  name: Joi.string().trim().max(80).required(),
  teacherCodes: Joi.array().items(Joi.string().trim()).max(20).default([]),
  days: Joi.array().items(Joi.string().valid(...batchDays)).unique().max(7).default([]),
  startTime: time.optional(),
  endTime: time.optional(),
  startDate: day.optional(),
  endDate: day.optional(),
  room: Joi.string().trim().max(40).allow("", null).optional(),
  capacity: Joi.number().integer().min(1).max(10000).allow(null).optional(),
  status: Joi.string().valid(...batchStatuses).optional(),
});

const createBatchSchema = batchFieldsSchema.required();
const updateBatchSchema = batchFieldsSchema
  .fork(["courseCode", "name"], (schema) => schema.optional())
  // No defaults on update, so leaving a list out keeps what is saved.
  .fork(["teacherCodes"], () => Joi.array().items(Joi.string().trim()).max(20).optional())
  .fork(["days"], () => Joi.array().items(Joi.string().valid(...batchDays)).unique().max(7).optional())
  .min(1);

const validateWithSchema = (schema, req, res, next) => {
  const { error, value } = schema.validate(req.body ?? {}, { abortEarly: false, stripUnknown: true });
  if (error) {
    return sendErrorResponse(res, error.details.map(({ message }) => message).join(", "), HttpStatus.BAD_REQUEST);
  }
  req.body = value;
  return next();
};

export const validateCreateBatch = (req, res, next) => validateWithSchema(createBatchSchema, req, res, next);
export const validateUpdateBatch = (req, res, next) => validateWithSchema(updateBatchSchema, req, res, next);
