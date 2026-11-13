import Joi from "joi";
import { taskKinds, taskStatuses } from "../model/task/task.js";
import { validateWith } from "../utilis/records.js";

const fields = Joi.object({
  kind: Joi.string().valid(...taskKinds).required(),
  title: Joi.string().trim().max(120).required(),
  batchCode: Joi.string().trim().required(),
  subject: Joi.string().trim().max(60).required(),
  dueDate: Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).required().messages({ "string.pattern.base": "Due date must be YYYY-MM-DD" }),
  description: Joi.string().trim().max(1000).allow("", null).optional(),
  attachment: Joi.object({ url: Joi.string().trim().uri().max(500).required(), name: Joi.string().trim().max(200).required() }).allow(null).optional(),
  status: Joi.string().valid(...taskStatuses).optional(),
});

export const validateCreateTask = validateWith(fields.required());
// The kind (homework / assignment) is fixed once created.
export const validateUpdateTask = validateWith(fields.fork(["title", "batchCode", "subject", "dueDate"], (schema) => schema.optional()).fork(["kind"], (schema) => schema.forbidden()).min(1));
