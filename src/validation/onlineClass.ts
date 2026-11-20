import Joi from "joi";
import { MEET_LINK } from "../model/onlineClass/onlineClass.js";
import { validateWith } from "../utilis/records.js";

const time = Joi.string().trim().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).messages({ "string.pattern.base": "Time must be HH:mm (24-hour)" });
const link = Joi.string().trim().max(300).uri({ scheme: ["https"] }).messages({ "string.uri": "Enter a full https:// link" });
const fields = Joi.object({
  batchCodes: Joi.array().items(Joi.string().trim().pattern(/^\d{6}$/)).min(1).max(20).required().messages({ "array.min": "Choose at least one section / batch" }),
  subject: Joi.string().trim().max(60).required(),
  topic: Joi.string().trim().max(120).required(),
  teacherCode: Joi.string().trim().pattern(/^\d{6}$/).allow("", null).optional(),
  date: Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).required().messages({ "string.pattern.base": "Date must be YYYY-MM-DD" }),
  startTime: time.required(),
  endTime: time.required(),
  meetLink: Joi.string().trim().pattern(MEET_LINK).required().messages({ "string.pattern.base": "Paste a Google Meet link like https://meet.google.com/abc-defg-hij" }),
  description: Joi.string().trim().max(1000).allow("", null).optional(),
  // Repeat weekly: Mon … Sun for this many weeks (including the first).
  repeatDays: Joi.array().items(Joi.string().valid("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")).max(7).optional(),
  repeatWeeks: Joi.number().integer().min(1).max(26).optional(),
});

export const validateCreateClass = validateWith(fields.required());
export const validateUpdateClass = validateWith(fields.fork(["batchCodes", "subject", "topic", "date", "startTime", "endTime", "meetLink"], (schema) => schema.optional())
  .keys({ cancelled: Joi.boolean().optional(), recordingLink: link.allow("", null).optional() }).min(1));
export const validateCompleteClass = validateWith(Joi.object({ recordingLink: link.allow("", null).optional() }).required());
