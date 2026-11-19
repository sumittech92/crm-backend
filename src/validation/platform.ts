import Joi from "joi";
import { MODULE_KEYS } from "../utilis/moduleAccess.js";
import { validateWith } from "../utilis/records.js";

const day = Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({ "string.pattern.base": "Dates must be YYYY-MM-DD" });
const color = Joi.string().trim().pattern(/^#[0-9a-fA-F]{6}$/).messages({ "string.pattern.base": "Colors must look like #4871e1" });

export const validateUpdateWorkspace = validateWith(Joi.object({
  instituteName: Joi.string().trim().max(80).optional(),
  fullName: Joi.string().trim().max(60).optional(),
  email: Joi.string().trim().email().max(120).optional(),
  phoneNumber: Joi.string().trim().pattern(/^\d{10}$/).optional().messages({ "string.pattern.base": "Mobile number must be 10 digits" }),
  address: Joi.string().trim().max(200).allow("", null).optional(),
  brandColor: color.optional(),
  secondaryColor: color.optional(),
  // Data URL from the panel (scaled to 256 px, so well under this limit).
  logo: Joi.string().max(400000).pattern(/^data:image\//).allow("", null).optional().messages({ "string.pattern.base": "Logo must be an image" }),
  disabledModules: Joi.array().items(Joi.string().valid(...MODULE_KEYS)).max(MODULE_KEYS.length).optional(),
}).min(1).required());

export const validateWorkspaceStatus = validateWith(Joi.object({ active: Joi.boolean().required() }).required());

const subscriptionFields = Joi.object({
  adminId: Joi.string().trim().hex().length(24).required().messages({ "string.length": "Choose an institute", "string.hex": "Choose an institute" }),
  plan: Joi.string().trim().max(40).required(),
  amount: Joi.number().min(0).max(1000000).required(),
  startDate: day.required(),
  renewalDate: day.required(),
  cancelled: Joi.boolean().optional(),
  note: Joi.string().trim().max(300).allow("", null).optional(),
});
export const validateCreateSubscription = validateWith(subscriptionFields.required());
export const validateUpdateSubscription = validateWith(subscriptionFields.fork(["adminId", "plan", "amount", "startDate", "renewalDate"], (schema) => schema.optional()).min(1));
export const validateRenewSubscription = validateWith(Joi.object({
  months: Joi.number().integer().min(1).max(24).required(),
  amount: Joi.number().min(0).max(10000000).optional(),
  paidOn: day.optional(),
  reference: Joi.string().trim().max(100).allow("", null).optional(),
}).required());

export const validatePlatformSettings = validateWith(Joi.object({
  plans: Joi.array().min(1).max(10).items(Joi.object({
    name: Joi.string().trim().max(40).required(),
    amount: Joi.number().min(0).max(1000000).required(),
    description: Joi.string().trim().max(120).allow("", null).optional(),
  })).optional(),
  supportPhone: Joi.string().trim().pattern(/^\d{10}$/).allow("", null).optional().messages({ "string.pattern.base": "Support phone must be 10 digits" }),
  supportEmail: Joi.string().trim().email().max(120).allow("", null).optional(),
  reminderDays: Joi.number().integer().min(1).max(60).optional(),
}).min(1).required());
