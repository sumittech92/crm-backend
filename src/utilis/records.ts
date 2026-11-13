import mongoose, { Model } from "mongoose";
import HttpStatus from "http-status-codes";
import { generateSixDigitId } from "./generateId.js";
import { sendErrorResponse } from "./response.js";
import { escapeRegex } from "./ownerScope.js";

/** Shared helpers for the academic records (sessions, subjects, timetable, events, homework / assignments). */

export const statusError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

export const blankToNull = (value: unknown) => typeof value === "string" && !value.trim() ? null : value;

/** Accepts a 6-digit code or a MongoDB _id. */
export const codeOrId = (value: unknown, codeField: string) => {
  const text = String(value ?? "").trim();
  if (/^\d{6}$/.test(text)) return { [codeField]: text };
  if (mongoose.Types.ObjectId.isValid(text)) return { _id: text };
  return null;
};

/** Case-insensitive exact match for a name. */
export const sameName = (name: string) => new RegExp(`^${escapeRegex(String(name).trim())}$`, "i");

/** "08:40" -> 520 */
export const minutes = (time: string) => { const [hours, mins] = time.split(":").map(Number); return hours * 60 + mins; };

export const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Today's weekday as "Mon" … "Sun" (server local time, like todayKey). */
export const todayName = () => DAY_ORDER[(new Date().getDay() + 6) % 7];

/** Creates a document with a fresh 6-digit code in `codeField`, retrying on the rare collision. */
export const insertWithCode = async (model: Model<any>, codeField: string, data: Record<string, any>) => {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await model.create({ ...data, [codeField]: generateSixDigitId() });
    } catch (error) {
      if (!(error.code === 11000 && error.keyPattern?.[codeField]) || attempt === 9) throw error;
    }
  }
  throw new Error(`Unable to generate a unique ${codeField}`);
};

/** Find one record of the institute by code or id, or throw 400 / 404. */
export const findScoped = async (model: Model<any>, codeField: string, identifier: unknown, scope: Record<string, any>, label: string) => {
  const match = codeOrId(identifier, codeField);
  if (!match) throw statusError(`Invalid ${label} ID`, HttpStatus.BAD_REQUEST);
  const record = await model.findOne({ ...match, ...scope }).lean();
  if (!record) throw statusError(`${label.charAt(0).toUpperCase()}${label.slice(1)} not found`, HttpStatus.NOT_FOUND);
  return record as Record<string, any>;
};

/** Controller error handler: known errors keep their status, anything else is logged and hidden. */
export const handleError = (res, error, label: string) => {
  if (error.statusCode) return sendErrorResponse(res, error.message, error.statusCode);
  if (error.name === "ValidationError") return sendErrorResponse(res, error.message, HttpStatus.BAD_REQUEST);
  if (error.code === 11000) return sendErrorResponse(res, "This record already exists", HttpStatus.CONFLICT);
  console.error(`${label}:`, error);
  return sendErrorResponse(res, "Something went wrong", HttpStatus.INTERNAL_SERVER_ERROR);
};

/** Joi middleware: replaces the body with the validated value, or answers 400 with every message. */
export const validateWith = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body ?? {}, { abortEarly: false, stripUnknown: true });
  if (error) return sendErrorResponse(res, error.details.map(({ message }) => message).join(", "), HttpStatus.BAD_REQUEST);
  req.body = value;
  return next();
};

/** Adds `name` to a string list on one document unless it is already there (ignoring case). */
export const addNameToList = async (model: Model<any>, id: unknown, path: string, name: string) => {
  const doc = await model.findById(id).select(path).lean();
  if (!doc) return;
  const current: string[] = path.split(".").reduce((value, key) => value?.[key], doc as any) || [];
  if (current.some(item => String(item).toLowerCase() === name.toLowerCase())) return;
  await model.updateOne({ _id: id }, { $push: { [path]: name } });
};
