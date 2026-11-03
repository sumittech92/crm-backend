import mongoose from "mongoose";

export const userRoles = ["superAdmin", "admin", "teacher", "student", "parent"] as const;
export const workRoles = ["school", "coaching"] as const;
export type UserRole = (typeof userRoles)[number];
export interface AuthDocument extends mongoose.Document {
  fullName: string | null; email: string | null; password: string | null; countryCode: string | null; phoneNumber: string | null;
  role: UserRole | null; workType: "school" | "coaching" | null; deviceToken: string | null; accessToken: string | null; isDeleted: boolean; isBlocked: boolean; lastLogin: number;
  otpHash?: string | null; otpExpiresAt?: Date | null; otpVerifiedAt?: Date | null;
}

const authSchema = new mongoose.Schema({
  fullName: { type: String, default: null },
  email: { type: String, default: null },
  password: { type: String, default: null },
  countryCode: { type: String, default: null },
  phoneNumber: { type: String, default: null },
  role: { type: String, enum: userRoles, default: null },
  workType: { type: String, enum: workRoles, default: null},
  deviceToken: { type: String, default: null },
  accessToken: { type: String, default: null },
  isDeleted: { type: Boolean, default: false },
  isBlocked: { type: Boolean, default: false },
  lastLogin: { type: Number, default: () => Date.now() },
  otpHash: { type: String, default: null, select: false },
  otpExpiresAt: { type: Date, default: null, select: false },
  otpVerifiedAt: { type: Date, default: null, select: false },
}, {
  strict: true,
  collection: "Auth",
  versionKey: false,
  timestamps: true,
});

const AuthModel = mongoose.model<AuthDocument>("Auth", authSchema);
export default AuthModel;

