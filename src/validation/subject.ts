import Joi from "joi";
import { subjectStatuses } from "../model/subject/subject.js";
import { validateWith } from "../utilis/records.js";

// Class, sections and teachers are sent as their 6-digit codes (or MongoDB ids). teacherCode null = not assigned yet.
const sections = Joi.array().items(Joi.object({
  batchCode: Joi.string().trim().required(),
  teacherCode: Joi.string().trim().allow(null, "").optional(),
})).max(26);

const fields = Joi.object({
  courseCode: Joi.string().trim().required(),
  name: Joi.string().trim().max(60).required(),
  code: Joi.string().trim().max(20).allow("", null).optional(),
  periodsPerWeek: Joi.number().integer().min(1).max(60).allow(null).optional(),
  sections: sections.default([]),
  status: Joi.string().valid(...subjectStatuses).optional(),
});

export const validateCreateSubject = validateWith(fields.required());
export const validateUpdateSubject = validateWith(fields
  .fork(["courseCode", "name"], (schema) => schema.optional())
  .fork(["sections"], () => sections.optional())
  .min(1));
