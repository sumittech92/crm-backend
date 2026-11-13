import Joi from "joi";
import { submissionModes } from "../model/fee/feeSubmission.js";
import { validateWith } from "../utilis/records.js";

const file = Joi.object({ url: Joi.string().trim().uri({ scheme: ["http", "https"] }).max(500).required(), name: Joi.string().trim().max(200).required() });

// A fee payment reported from the portal. Cash needs a receipt number or a note; other methods need the transaction / UTR number.
export const validateFeeSubmission = validateWith(Joi.object({
  period: Joi.string().trim().max(60).required(),
  amount: Joi.number().integer().min(1).max(10000000).required(),
  mode: Joi.string().valid(...submissionModes).required(),
  reference: Joi.when("mode", {
    is: "Cash at office",
    then: Joi.string().trim().max(30).allow("", null).optional(),
    otherwise: Joi.string().trim().pattern(/^[A-Za-z0-9-]{6,30}$/).required().messages({ "string.pattern.base": "Enter the transaction / UTR number (6–30 letters or digits)", "any.required": "Enter the transaction / UTR number" }),
  }),
  proof: file.allow(null).optional(),
  note: Joi.string().trim().max(200).allow("", null).optional(),
}).custom((value, helpers) => value.mode === "Cash at office" && !value.reference && !value.note ? helpers.message({ custom: "For cash payments, add the office receipt number or a note" }) : value));

export const validateTaskSubmission = validateWith(Joi.object({ file: file.required() }));
