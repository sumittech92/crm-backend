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
  instituteName: Joi.string().trim().max(100).allow("", null).optional(),
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

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).invalid(Joi.ref("currentPassword")).required().messages({
    "any.invalid": "New password must be different from the current password",
  }),
  confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required().messages({
    "any.only": "Confirm password must match new password",
  }),
}).required();

export const blockUserSchema = Joi.object({
  isBlocked: Joi.boolean().required(),
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
export const validateChangePassword = validate(changePasswordSchema);
export const validateBlockUser = validate(blockUserSchema);

export const domainSchema = Joi.object({
  customDomain: Joi.string().trim().max(253).allow("", null).required(),
}).required();
export const validateDomain = validate(domainSchema);





