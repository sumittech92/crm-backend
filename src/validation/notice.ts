import Joi from "joi";
import HttpStatus from "http-status-codes";
import { sendErrorResponse } from "../utilis/response.js";
import { noticeAudiences, noticeStatuses, noticeTypes } from "../model/notice/notice.js";

const day = Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({ "string.pattern.base": "Dates must be YYYY-MM-DD" });

const noticeFieldsSchema = Joi.object({
  title: Joi.string().trim().max(120).required(),
  description: Joi.string().trim().max(2000).required(),
  type: Joi.string().valid(...noticeTypes).optional(),
  audience: Joi.string().valid(...noticeAudiences).optional(),
  // Students only: narrow to a course (school: class) and its batches (school: sections).
  courseCode: Joi.string().trim().allow("", null).optional(),
  batchCodes: Joi.array().items(Joi.string().trim()).max(30).default([]),
  publishDate: day.allow("", null).optional(),
  expiryDate: day.allow("", null).optional(),
  pinned: Joi.boolean().optional(),
  showOnWebsite: Joi.boolean().optional(),
  status: Joi.string().valid(...noticeStatuses).optional(),
});

const createNoticeSchema = noticeFieldsSchema.required();
const updateNoticeSchema = noticeFieldsSchema
  .fork(["title", "description"], (schema) => schema.optional())
  .fork(["batchCodes"], () => Joi.array().items(Joi.string().trim()).max(30).optional())
  .min(1);

const validateWithSchema = (schema, req, res, next) => {
  const { error, value } = schema.validate(req.body ?? {}, { abortEarly: false, stripUnknown: true });
  if (error) {
    return sendErrorResponse(res, error.details.map(({ message }) => message).join(", "), HttpStatus.BAD_REQUEST);
  }
  req.body = value;
  return next();
};

export const validateCreateNotice = (req, res, next) => validateWithSchema(createNoticeSchema, req, res, next);
export const validateUpdateNotice = (req, res, next) => validateWithSchema(updateNoticeSchema, req, res, next);
