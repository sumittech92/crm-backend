import Joi from "joi";
import { batchDays } from "../model/teacher/batchModel.js";
import { validateWith } from "../utilis/records.js";

const time = Joi.string().trim().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).messages({ "string.pattern.base": "Time must be HH:mm (24-hour)" });

const fields = Joi.object({
  batchCode: Joi.string().trim().required(),
  subjectCode: Joi.string().trim().required(),
  day: Joi.string().valid(...batchDays).required(),
  startTime: time.required(),
  endTime: time.required(),
  room: Joi.string().trim().max(40).allow("", null).optional(),
});

export const validateCreatePeriod = validateWith(fields.required());
export const validateUpdatePeriod = validateWith(fields.fork(["batchCode", "subjectCode", "day", "startTime", "endTime"], (schema) => schema.optional()).min(1));
