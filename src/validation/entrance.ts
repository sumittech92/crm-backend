import Joi from "joi";
import { primaryClasses } from "../model/entrance/entrance.js";
import { validateWith } from "../utilis/records.js";

const time = Joi.string().trim().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).allow("", null).optional().messages({ "string.pattern.base": "Time must be HH:mm (24-hour)" });
const fields = Joi.object({
  name: Joi.string().trim().max(100).required(),
  className: Joi.string().valid(...primaryClasses).required().messages({ "any.only": "Entrance tests are only for Nursery to Class 5" }),
  date: Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).required().messages({ "string.pattern.base": "Date must be YYYY-MM-DD" }),
  startTime: time,
  endTime: time,
  venue: Joi.string().trim().max(100).allow("", null).optional(),
  maxMarks: Joi.number().integer().min(1).max(1000).required(),
  passMarks: Joi.number().integer().min(0).max(1000).required(),
  instructions: Joi.string().trim().max(1000).allow("", null).optional(),
  cancelled: Joi.boolean().optional(),
});

export const validateCreateEntrance = validateWith(fields.required());
export const validateUpdateEntrance = validateWith(fields.fork(["name", "className", "date", "maxMarks", "passMarks"], (schema) => schema.optional()).min(1));
export const validateEntranceCandidates = validateWith(Joi.object({
  candidates: Joi.array().max(500).items(Joi.object({
    enquiryCode: Joi.string().trim().pattern(/^\d{6}$/).allow("", null).optional(),
    studentName: Joi.string().trim().max(80).required(),
    parentName: Joi.string().trim().max(80).allow("", null).optional(),
    phoneNumber: Joi.string().trim().pattern(/^\d{10}$/).allow("", null).optional().messages({ "string.pattern.base": "Phone must be 10 digits" }),
    marks: Joi.number().min(0).max(1000).allow(null).optional(),
    remarks: Joi.string().trim().max(200).allow("", null).optional(),
  })).required(),
}).required());
