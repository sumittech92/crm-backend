import Joi from "joi";

const schoolInfoSchema = Joi.object({
  designation: Joi.string().trim().allow("", null).optional(),

  department: Joi.string().trim().allow("", null).optional(),

  qualification: Joi.array()
    .items(Joi.string().trim().required())
    .default([]),

  subjects: Joi.array()
    .items(Joi.string().trim().required())
    .default([]),

  classesTaught: Joi.array()
    .items(Joi.string().trim().required())
    .default([]),
});

const coachingInfoSchema = Joi.object({
  qualification: Joi.array()
    .items(Joi.string().trim().required())
    .default([]),

  experience: Joi.number()
    .min(0)
    .allow(null)
    .optional(),

  subjects: Joi.array()
    .items(Joi.string().trim().required())
    .default([]),

  classesTaught: Joi.array()
    .items(Joi.string().trim().required())
    .default([]),
});

export const createTeacherValidator = Joi.object({
  fullName: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().trim().email().lowercase().required(),
  password: Joi.string().min(8).required(),

  countryCode: Joi.string().trim().pattern(/^\+[1-9]\d{0,3}$/).required(),

  phoneNumber: Joi.string().trim().pattern(/^\d{7,15}$/).required(),

  joiningDate: Joi.date().iso().allow(null).optional(),

  status: Joi.string()
    .valid("active", "inactive", "pending")
    .default("pending"),

  profileImage: Joi.string().trim().allow(null, "").optional(),

  gender: Joi.string()
    .valid("male", "female")
    .allow(null)
    .optional(),

  schoolInfo: schoolInfoSchema.optional(),

  coachingInfo: coachingInfoSchema.optional(),
})
  .xor("schoolInfo", "coachingInfo")
  .messages({
    "object.missing":
      "Exactly one of schoolInfo or coachingInfo is required",
    "object.xor":
      "Exactly one of schoolInfo or coachingInfo is required",
  });

export const validateCreateTeacher = (req, res, next) => {
  const { error, value } = createTeacherValidator.validate(req.body ?? {}, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details.map(({ message }) => message).join(", "),
      data: [],
    });
  }
  req.body = value;
  return next();
};
