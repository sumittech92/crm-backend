import Joi from "joi";
import { salaryModes } from "../model/salary/salary.js";
import { validateWith } from "../utilis/records.js";

const amount = Joi.number().min(0).max(10000000);
const fields = Joi.object({
  teacherCode: Joi.string().trim().pattern(/^\d{6}$/).required().messages({ "string.pattern.base": "Choose a teacher" }),
  month: Joi.string().trim().pattern(/^\d{4}-(0[1-9]|1[0-2])$/).required().messages({ "string.pattern.base": "Month must be YYYY-MM" }),
  basic: amount.required(),
  allowances: amount.optional(),
  bonus: amount.optional(),
  deductions: amount.optional(),
  status: Joi.string().valid("pending", "paid").optional(),
  paidOn: Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).allow("", null).optional().messages({ "string.pattern.base": "Paid on must be YYYY-MM-DD" }),
  mode: Joi.string().valid(...salaryModes).allow(null).optional(),
  reference: Joi.string().trim().max(100).allow("", null).optional(),
  note: Joi.string().trim().max(500).allow("", null).optional(),
});

export const validateCreateSalary = validateWith(fields.required());
export const validateUpdateSalary = validateWith(fields.fork(["teacherCode", "month", "basic"], (schema) => schema.optional()).min(1));
export const validateGenerateSalary = validateWith(Joi.object({
  month: Joi.string().trim().pattern(/^\d{4}-(0[1-9]|1[0-2])$/).required().messages({ "string.pattern.base": "Month must be YYYY-MM" }),
}).required());
