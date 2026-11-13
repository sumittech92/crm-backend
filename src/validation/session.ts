import Joi from "joi";
import { sessionStatuses } from "../model/session/session.js";
import { validateWith } from "../utilis/records.js";

const day = Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({ "string.pattern.base": "Dates must be YYYY-MM-DD" });

const fields = Joi.object({
  name: Joi.string().trim().max(40).required(),
  startDate: day.required(),
  endDate: day.required(),
  terms: Joi.array().items(Joi.string().trim().max(40)).max(6).default([]),
  status: Joi.string().valid(...sessionStatuses).optional(),
});

export const validateCreateSession = validateWith(fields.required());
export const validateUpdateSession = validateWith(fields
  .fork(["name", "startDate", "endDate"], (schema) => schema.optional())
  .fork(["terms"], () => Joi.array().items(Joi.string().trim().max(40)).max(6).optional())
  .min(1));
