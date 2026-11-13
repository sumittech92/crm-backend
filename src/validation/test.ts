import Joi from "joi";
import HttpStatus from "http-status-codes";
import { sendErrorResponse } from "../utilis/response.js";

const day = Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({ "string.pattern.base": "Dates must be YYYY-MM-DD" });

const paperSchema = Joi.object({
  // Present when editing an existing paper, so its marks stay attached.
  paperId: Joi.string().trim().optional(),
  subject: Joi.string().trim().max(60).required(),
  date: day.required(),
  maxMarks: Joi.number().min(1).max(1000).required(),
  passMarks: Joi.number().min(0).max(1000).allow(null).optional(),
});

const clock = Joi.string().trim().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).allow(null, "").messages({ "string.pattern.base": "Times must be HH:mm (24-hour)" });

// School admit cards: only the owner (principal) may change these (checked in the service).
const admitCardSchema = Joi.object({
  released: Joi.boolean().optional(),
  feeRequired: Joi.boolean().optional(),
  instructions: Joi.string().trim().max(1000).allow("", null).optional(),
});

// Course (school: class) and batches (school: sections) are sent as their 6-digit codes.
const testFieldsSchema = Joi.object({
  name: Joi.string().trim().max(80).required(),
  term: Joi.string().trim().max(40).allow("", null).optional(),
  courseCode: Joi.string().trim().allow("", null).optional(),
  batchCodes: Joi.array().items(Joi.string().trim()).max(30).default([]),
  papers: Joi.array().items(paperSchema).min(1).max(20).required(),
  // School: one exam time for every paper.
  startTime: clock.optional(),
  endTime: clock.optional(),
  admitCard: admitCardSchema.optional(),
  cancelled: Joi.boolean().optional(),
});

const createTestSchema = testFieldsSchema.required();
const updateTestSchema = testFieldsSchema
  .fork(["name", "papers"], (schema) => schema.optional())
  .fork(["batchCodes"], () => Joi.array().items(Joi.string().trim()).max(30).optional())
  .min(1);

const marksSchema = Joi.object({
  paperId: Joi.string().trim().required(),
  entries: Joi.array().items(Joi.object({
    studentCode: Joi.string().trim().pattern(/^\d{6}$/).required(),
    marks: Joi.number().min(0).max(1000).allow(null).optional(),
    absent: Joi.boolean().default(false),
    remarks: Joi.string().trim().max(200).allow("", null).optional(),
  })).min(1).max(500).required(),
}).required();

const studentCode = Joi.string().trim().pattern(/^\d{6}$/).messages({ "string.pattern.base": "Student ID must be 6 digits" });

// Owner lets one fee-pending student download their own admit card (or takes that back).
const admitAllowSchema = Joi.object({ studentCode: studentCode.required(), allowed: Joi.boolean().required() }).required();
// Class teacher / owner prints admit cards for one or more students.
const admitDownloadSchema = Joi.object({ studentCodes: Joi.array().items(studentCode).min(1).max(500).required() }).required();
// Optional subjects a student takes (names of the class's optional subjects); an empty list is allowed.
export const optionalSubjectsSchema = Joi.object({ subjects: Joi.array().items(Joi.string().trim().max(60)).max(20).required() }).required();

const validateWithSchema = (schema, req, res, next) => {
  const { error, value } = schema.validate(req.body ?? {}, { abortEarly: false, stripUnknown: true });
  if (error) {
    return sendErrorResponse(res, error.details.map(({ message }) => message).join(", "), HttpStatus.BAD_REQUEST);
  }
  req.body = value;
  return next();
};

export const validateCreateTest = (req, res, next) => validateWithSchema(createTestSchema, req, res, next);
export const validateUpdateTest = (req, res, next) => validateWithSchema(updateTestSchema, req, res, next);
export const validateMarks = (req, res, next) => validateWithSchema(marksSchema, req, res, next);
export const validateAdmitAllow = (req, res, next) => validateWithSchema(admitAllowSchema, req, res, next);
export const validateAdmitDownload = (req, res, next) => validateWithSchema(admitDownloadSchema, req, res, next);
export const validateOptionalSubjects = (req, res, next) => validateWithSchema(optionalSubjectsSchema, req, res, next);
