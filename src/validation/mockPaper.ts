import Joi from "joi";
import { PAPER_BOARDS, PAPER_CLASSES, PAPER_DIFFICULTIES, PAPER_KINDS, PAPER_LENGTHS } from "../model/mockPaper/mockPaper.js";
import { validateWith } from "../utilis/records.js";

export const validateGeneratePaper = validateWith(Joi.object({
  board: Joi.string().valid(...PAPER_BOARDS).required(),
  // Students always get their own class; staff choose.
  className: Joi.string().valid(...PAPER_CLASSES).optional(),
  subject: Joi.string().trim().max(60).required(),
  kind: Joi.string().valid(...PAPER_KINDS).required(),
  chapters: Joi.array().items(Joi.string().trim().max(120)).max(15).when("kind", { is: "chapter", then: Joi.array().min(1).required().messages({ "array.min": "Choose at least one chapter" }), otherwise: Joi.optional() }),
  length: Joi.string().valid(...PAPER_LENGTHS).required(),
  difficulty: Joi.string().valid(...PAPER_DIFFICULTIES).required(),
}).required());
