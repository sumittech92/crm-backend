import Joi from "joi";
import HttpStatus from "http-status-codes";
import { sendErrorResponse } from "../utilis/response.js";
import { postStatuses, postTypes } from "../model/post/post.js";
import { MAX_ALBUM_ITEMS, albumStatuses } from "../model/gallery/album.js";

const day = Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({ "string.pattern.base": "Dates must be YYYY-MM-DD" });
const link = Joi.string().trim().uri({ scheme: ["http", "https"] }).max(500).messages({ "string.uri": "Link must start with http:// or https://" });

const postFieldsSchema = Joi.object({
  title: Joi.string().trim().max(120).required(),
  description: Joi.string().trim().max(3000).required(),
  type: Joi.string().valid(...postTypes).optional(),
  // From POST /upload/media.
  imageUrl: link.allow("", null).optional(),
  videoLink: link.allow("", null).optional(),
  publishDate: day.allow("", null).optional(),
  pinned: Joi.boolean().optional(),
  showOnWebsite: Joi.boolean().optional(),
  status: Joi.string().valid(...postStatuses).optional(),
});

const albumFieldsSchema = Joi.object({
  name: Joi.string().trim().max(80).required(),
  description: Joi.string().trim().max(500).allow("", null).optional(),
  date: day.allow("", null).optional(),
  coverItemId: Joi.string().trim().allow("", null).optional(),
  showOnWebsite: Joi.boolean().optional(),
  status: Joi.string().valid(...albumStatuses).optional(),
});

const albumItemsSchema = Joi.object({
  items: Joi.array().items(Joi.object({
    kind: Joi.string().valid("image", "video").required(),
    url: link.required(),
    caption: Joi.string().trim().max(120).allow("", null).optional(),
    size: Joi.number().min(0).allow(null).optional(),
  })).min(1).max(MAX_ALBUM_ITEMS).required(),
}).required();

const validateWithSchema = (schema, req, res, next) => {
  const { error, value } = schema.validate(req.body ?? {}, { abortEarly: false, stripUnknown: true });
  if (error) {
    return sendErrorResponse(res, error.details.map(({ message }) => message).join(", "), HttpStatus.BAD_REQUEST);
  }
  req.body = value;
  return next();
};

export const validateCreatePost = (req, res, next) => validateWithSchema(postFieldsSchema.required(), req, res, next);
export const validateUpdatePost = (req, res, next) => validateWithSchema(postFieldsSchema.fork(["title", "description"], (schema) => schema.optional()).min(1), req, res, next);
export const validateCreateAlbum = (req, res, next) => validateWithSchema(albumFieldsSchema.required(), req, res, next);
export const validateUpdateAlbum = (req, res, next) => validateWithSchema(albumFieldsSchema.fork(["name"], (schema) => schema.optional()).min(1), req, res, next);
export const validateAlbumItems = (req, res, next) => validateWithSchema(albumItemsSchema, req, res, next);
