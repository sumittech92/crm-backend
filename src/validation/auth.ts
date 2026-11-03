import Joi from "joi";
import HttpStatus from "http-status-codes";
import { sendErrorResponse } from "../utilis/response.js";

export const registerSchema = Joi.object({
  fullName: Joi.string().trim().required(),
  email: Joi.string().trim().email().required(),
  password: Joi.string().min(8).required(),
  countryCode: Joi.string().trim().required(),
  phoneNumber: Joi.string().trim().required(),
  workType: Joi.string().valid("school", "coaching").optional(),
}).required();

export const loginSchema = Joi.object({
  email: Joi.string().trim().email(),
  countryCode: Joi.string().trim(),
  phoneNumber: Joi.string().trim(),
  password: Joi.string().required(),
})
  .xor("email", "phoneNumber")
  .with("phoneNumber", "countryCode")
  .required();

export const forgotPasswordSchema = Joi.object({
  phoneNumber: Joi.string().trim().required(),
}).required();

export const verifyOtpSchema = Joi.object({
  otp: Joi.string().valid("1234").required(),
}).required();
export const resetPasswordSchema = Joi.object({
  newPassword: Joi.string().min(8).required(),
  confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required().messages({
    "any.only": "Confirm password must match new password",
  }),
}).required();

const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body ?? {}, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    return sendErrorResponse(
      res,
      error.details.map(({ message }) => message).join(", "),
      HttpStatus.BAD_REQUEST,
    );
  }
  req.body = value;
  return next();
};

export const validateRegister = validate(registerSchema);
export const validateLogin = validate(loginSchema);
export const validateForgotPassword = validate(forgotPasswordSchema);
export const validateResetPassword = validate(resetPasswordSchema);
export const validateOtp = validate(verifyOtpSchema);





