import Joi from "joi";
import { equipmentConditions, labTypes } from "../model/lab/lab.js";
import { validateWith } from "../utilis/records.js";

const status = Joi.string().valid("active", "inactive").optional();
const labFields = Joi.object({
  name: Joi.string().trim().max(80).required(),
  type: Joi.string().valid(...labTypes).required(),
  room: Joi.string().trim().max(60).allow("", null).optional(),
  inChargeCode: Joi.string().trim().pattern(/^\d{6}$/).allow("", null).optional().messages({ "string.pattern.base": "Choose a teacher" }),
  capacity: Joi.number().integer().min(1).max(500).allow(null).optional(),
  description: Joi.string().trim().max(500).allow("", null).optional(),
  status,
});
const equipmentFields = Joi.object({
  labCode: Joi.string().trim().pattern(/^\d{6}$/).required().messages({ "string.pattern.base": "Choose a lab" }),
  name: Joi.string().trim().max(80).required(),
  quantity: Joi.number().integer().min(0).max(100000).required(),
  condition: Joi.string().valid(...equipmentConditions).required(),
  purchaseDate: Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).allow("", null).optional().messages({ "string.pattern.base": "Purchase date must be YYYY-MM-DD" }),
  note: Joi.string().trim().max(300).allow("", null).optional(),
  status,
});

export const validateCreateLab = validateWith(labFields.required());
export const validateUpdateLab = validateWith(labFields.fork(["name", "type"], (schema) => schema.optional()).min(1));
export const validateCreateEquipment = validateWith(equipmentFields.required());
export const validateUpdateEquipment = validateWith(equipmentFields.fork(["labCode", "name", "quantity", "condition"], (schema) => schema.optional()).min(1));
