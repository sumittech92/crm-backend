import Joi from "joi";
import HttpStatus from "http-status-codes";
import { sendErrorResponse } from "../utilis/response.js";

const day = Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({ "string.pattern.base": "Dates must be YYYY-MM-DD" });

const bookSchema = Joi.object({
  title: Joi.string().trim().max(160).required(),
  author: Joi.string().trim().max(120).required(),
  isbn: Joi.string().trim().replace(/[\s-]/g, "").pattern(/^(\d{9}[\dXx]|\d{13})$/).allow("", null).optional().messages({ "string.pattern.base": "ISBN must have 10 or 13 digits" }),
  category: Joi.string().trim().max(60).required(),
  shelf: Joi.string().trim().max(30).allow("", null).optional(),
  // Coaching: number of copies. School: accession numbers (blank ones are generated), or a copy count to generate.
  copies: Joi.number().integer().min(1).max(1000).optional(),
  accessionNumbers: Joi.array().items(Joi.string().trim().max(30)).max(1000).optional(),
});

const settingsSchema = Joi.object({
  loanDays: Joi.number().integer().min(1).max(365).optional(),
  finePerDay: Joi.number().min(0).max(1000).optional(),
  maxBooks: Joi.number().integer().min(1).max(50).optional(),
}).min(1);

const issueSchema = Joi.object({
  bookCode: Joi.string().trim().required(),
  memberType: Joi.string().valid("student", "teacher").required(),
  memberCode: Joi.string().trim().pattern(/^\d{6}$/).required(),
  issuedOn: day.allow("", null).optional(),
  accessionNo: Joi.string().trim().max(30).allow("", null).optional(),
  requestCode: Joi.string().trim().allow("", null).optional(),
}).required();

const validateWithSchema = (schema, req, res, next) => {
  const { error, value } = schema.validate(req.body ?? {}, { abortEarly: false, stripUnknown: true });
  if (error) {
    return sendErrorResponse(res, error.details.map(({ message }) => message).join(", "), HttpStatus.BAD_REQUEST);
  }
  req.body = value;
  return next();
};

export const validateBook = (req, res, next) => validateWithSchema(bookSchema.required(), req, res, next);
export const validateBookUpdate = (req, res, next) => validateWithSchema(bookSchema.fork(["title", "author", "category"], (schema) => schema.optional()).min(1), req, res, next);
export const validateLibrarySettings = (req, res, next) => validateWithSchema(settingsSchema, req, res, next);
export const validateIssue = (req, res, next) => validateWithSchema(issueSchema, req, res, next);
export const validateReturn = (req, res, next) => validateWithSchema(Joi.object({ waiveFine: Joi.boolean().default(false) }), req, res, next);
export const validateBookRequest = (req, res, next) => validateWithSchema(Joi.object({ bookCode: Joi.string().trim().required() }).required(), req, res, next);
