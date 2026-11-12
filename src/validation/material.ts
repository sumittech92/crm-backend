import Joi from "joi";
import HttpStatus from "http-status-codes";
import { sendErrorResponse } from "../utilis/response.js";
import { materialStatuses, materialTypes } from "../model/material/material.js";

// The file comes from POST /upload/material first; its result is sent here as-is.
const fileSchema = Joi.object({
  url: Joi.string().trim().uri({ scheme: ["http", "https"] }).required(),
  name: Joi.string().trim().max(200).required(),
  size: Joi.number().min(0).required(),
  mimeType: Joi.string().trim().max(120).required(),
}).allow(null);

const materialFieldsSchema = Joi.object({
  title: Joi.string().trim().max(120).required(),
  description: Joi.string().trim().max(1000).allow("", null).optional(),
  courseCode: Joi.string().trim().required(),
  batchCodes: Joi.array().items(Joi.string().trim()).max(30).default([]),
  subject: Joi.string().trim().max(60).allow("", null).optional(),
  type: Joi.string().valid(...materialTypes).required(),
  file: fileSchema.optional(),
  link: Joi.string().trim().uri({ scheme: ["http", "https"] }).max(500).allow("", null).optional().messages({ "string.uri": "Link must start with http:// or https://" }),
  status: Joi.string().valid(...materialStatuses).optional(),
});

const createMaterialSchema = materialFieldsSchema.required();
const updateMaterialSchema = materialFieldsSchema
  .fork(["title", "courseCode", "type"], (schema) => schema.optional())
  .fork(["batchCodes"], () => Joi.array().items(Joi.string().trim()).max(30).optional())
  .min(1);

const validateWithSchema = (schema, req, res, next) => {
  const { error, value } = schema.validate(req.body ?? {}, { abortEarly: false, stripUnknown: true });
  if (error) {
    return sendErrorResponse(res, error.details.map(({ message }) => message).join(", "), HttpStatus.BAD_REQUEST);
  }
  req.body = value;
  return next();
};

export const validateCreateMaterial = (req, res, next) => validateWithSchema(createMaterialSchema, req, res, next);
export const validateUpdateMaterial = (req, res, next) => validateWithSchema(updateMaterialSchema, req, res, next);
