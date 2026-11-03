import Joi from "joi";
import HttpStatus from "http-status-codes";
import { sendErrorResponse } from "../utilis/response.js";

// Every section is a flat map of text fields; keys are field names used by the Website page.
const textMap = Joi.object().pattern(/^[A-Za-z][A-Za-z0-9]{0,39}$/, Joi.string().allow("").max(2000)).max(40);
const textList = Joi.array().items(textMap).max(100);

const websiteSchema = Joi.object({
  settings: textMap.keys({ name: Joi.string().trim().max(100).required() }).required(),
  home: textMap.default({}),
  about: textMap.default({}),
  contact: textMap.default({}),
  social: textMap.default({}),
  courses: textList.default([]),
  faculty: textList.default([]),
  results: textList.default([]),
  gallery: textList.default([]),
  updates: textList.default([]),
}).required();

const publishSchema = Joi.object({ isPublished: Joi.boolean().required() }).required();

const validateWithSchema = (schema, req, res, next) => {
  const { error, value } = schema.validate(req.body ?? {}, { abortEarly: false, stripUnknown: true });
  if (error) {
    return sendErrorResponse(res, error.details.map(({ message }) => message).join(", "), HttpStatus.BAD_REQUEST);
  }
  req.body = value;
  return next();
};

export const validateWebsite = (req, res, next) => validateWithSchema(websiteSchema, req, res, next);
export const validatePublish = (req, res, next) => validateWithSchema(publishSchema, req, res, next);
