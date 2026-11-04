import Joi from "joi";
import HttpStatus from "http-status-codes";
import { sendErrorResponse } from "../utilis/response.js";
import { paymentModes } from "../model/fee/fee.js";

const day = Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({ "string.pattern.base": "{#label} must be YYYY-MM-DD" });
const studentIds = Joi.array().items(Joi.string().trim().pattern(/^\d{6}$/)).min(1).max(500).unique();
const amount = Joi.number().min(0).max(100000000);

const createFeeSchema = Joi.object({
  studentIds: studentIds.required(),
  period: Joi.string().trim().max(60).required(),
  totalFee: amount.greater(0).required(),
  discount: amount.optional(),
  dueDate: day.allow(null, "").optional(),
  note: Joi.string().trim().max(500).allow("", null).optional(),
}).required();

const collectFeeSchema = Joi.object({
  studentIds: studentIds.required(),
  period: Joi.string().trim().max(60).required(),
  amount: amount.required(),
  discount: amount.optional(),
  mode: Joi.string().valid(...paymentModes).required(),
  date: day.required(),
  reference: Joi.string().trim().max(120).allow("", null).optional(),
  note: Joi.string().trim().max(500).allow("", null).optional(),
  totalFee: amount.greater(0).allow(null).optional(),
  dueDate: day.allow(null, "").optional(),
}).required();

const updateFeeSchema = Joi.object({
  totalFee: amount.greater(0).optional(),
  discount: amount.optional(),
  dueDate: day.allow(null, "").optional(),
  note: Joi.string().trim().max(500).allow("", null).optional(),
}).min(1).required();

const validateWithSchema = (schema, req, res, next) => {
  const { error, value } = schema.validate(req.body ?? {}, { abortEarly: false, stripUnknown: true });
  if (error) {
    return sendErrorResponse(res, error.details.map(({ message }) => message).join(", "), HttpStatus.BAD_REQUEST);
  }
  req.body = value;
  return next();
};

export const validateCreateFee = (req, res, next) => validateWithSchema(createFeeSchema, req, res, next);
export const validateCollectFee = (req, res, next) => validateWithSchema(collectFeeSchema, req, res, next);
export const validateUpdateFee = (req, res, next) => validateWithSchema(updateFeeSchema, req, res, next);
