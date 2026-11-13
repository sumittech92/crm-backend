import Joi from "joi";
import { eventAudiences } from "../model/event/event.js";
import { validateWith } from "../utilis/records.js";

const fields = Joi.object({
  name: Joi.string().trim().max(100).required(),
  date: Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).required().messages({ "string.pattern.base": "Date must be YYYY-MM-DD" }),
  startTime: Joi.string().trim().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).allow("", null).optional().messages({ "string.pattern.base": "Time must be HH:mm (24-hour)" }),
  venue: Joi.string().trim().max(100).allow("", null).optional(),
  audience: Joi.string().valid(...eventAudiences).optional(),
  description: Joi.string().trim().max(1000).allow("", null).optional(),
  cancelled: Joi.boolean().optional(),
});

export const validateCreateEvent = validateWith(fields.required());
export const validateUpdateEvent = validateWith(fields.fork(["name", "date"], (schema) => schema.optional()).min(1));
