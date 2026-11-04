import Joi from "joi";
import HttpStatus from "http-status-codes";
import { sendErrorResponse } from "../utilis/response.js";
import { attendanceStatuses } from "../model/attendance/attendance.js";

const markAttendanceSchema = Joi.object({
  date: Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).required().messages({ "string.pattern.base": "date must be YYYY-MM-DD" }),
  records: Joi.array().items(Joi.object({
    studentId: Joi.string().trim().pattern(/^\d{6}$/).required(),
    status: Joi.string().valid(...attendanceStatuses).required(),
    note: Joi.string().trim().max(300).allow("", null).optional(),
  })).min(1).max(1000).unique("studentId").required(),
}).required();

const validateWithSchema = (schema, req, res, next) => {
  const { error, value } = schema.validate(req.body ?? {}, { abortEarly: false, stripUnknown: true });
  if (error) {
    return sendErrorResponse(res, error.details.map(({ message }) => message).join(", "), HttpStatus.BAD_REQUEST);
  }
  req.body = value;
  return next();
};

export const validateMarkAttendance = (req, res, next) => validateWithSchema(markAttendanceSchema, req, res, next);
