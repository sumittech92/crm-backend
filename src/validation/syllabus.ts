import Joi from "joi";
import { validateWith } from "../utilis/records.js";

const chapter = Joi.object({
  chapterId: Joi.string().trim().allow("", null).optional(),
  title: Joi.string().trim().max(150).required(),
  targetMonth: Joi.string().trim().pattern(/^\d{4}-(0[1-9]|1[0-2])$/).allow("", null).optional().messages({ "string.pattern.base": "Target month must be YYYY-MM" }),
  weight: Joi.number().integer().min(1).max(100).optional(),
});

export const validateCreateSyllabus = validateWith(Joi.object({
  courseCode: Joi.string().trim().required(),
  subject: Joi.string().trim().max(60).required(),
  chapters: Joi.array().items(chapter).max(150).default([]),
}).required());
export const validateUpdateSyllabus = validateWith(Joi.object({ chapters: Joi.array().items(chapter).max(150).required() }).required());
export const validateMarkChapter = validateWith(Joi.object({
  batchCode: Joi.string().trim().required(),
  chapterId: Joi.string().trim().required(),
  done: Joi.boolean().required(),
  completedOn: Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).allow("", null).optional(),
}).required());
