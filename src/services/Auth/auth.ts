import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import axios from "axios";
import AuthModel, { type UserRole } from "../../model/Auth/auth.js";

const scrypt = promisify(scryptCallback);

export class AuthClass {
  static async create({ fullName, email, password, countryCode, phoneNumber, role = "student", workType }: { fullName: string; email: string; password: string; countryCode: string; phoneNumber: string; role?: UserRole; workType?: "school" | "coaching" }) {
    const user = await AuthModel.create({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      password,
      countryCode: countryCode.trim(),
      phoneNumber: phoneNumber.trim(),
      role,
      workType: role === "admin" ? workType : null,
    });
    const result = user.toObject();
    delete result.password;
    return result;
  }

  static async findForLogin({ email, phoneNumber, countryCode }: { email?: string; phoneNumber?: string; countryCode?: string }) {
    const query = email
      ? { email: email.trim().toLowerCase() }
      : { phoneNumber: phoneNumber!.trim(), countryCode: countryCode!.trim() };
    return AuthModel.findOne({ ...query, isDeleted: false }).lean();
  }

  static async findByPhone(phoneNumber: string) {
    return AuthModel.findOne({ phoneNumber: phoneNumber.trim(), isDeleted: false }).select("+otpHash +otpExpiresAt");
  }

  static async updateAccessToken(userId: unknown, accessToken: string) {
    return AuthModel.updateOne({ _id: userId }, { $set: { accessToken, lastLogin: Date.now() } });
  }

  static async clearAccessToken(userId: unknown) {
    return AuthModel.updateOne({ _id: userId }, { $set: { accessToken: null } });
  }

  static async hashSecret(secret: string) {
    const salt = randomBytes(16).toString("hex");
    const key = await scrypt(secret, salt, 64);
    return `scrypt:${salt}:${key.toString("hex")}`;
  }

  static async verifySecret(secret: string, storedHash: string | null | undefined) {
    const [algorithm, salt, keyHex] = (storedHash ?? "").split(":");
    if (algorithm !== "scrypt" || !salt || !keyHex) return false;
    const expected = Buffer.from(keyHex, "hex");
    const actual = await scrypt(secret, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  static createOtp() {
    return "1234";
  }

  static async sendOtp(phoneNumber: string, otp: string) {
    const smsApiUrl = process.env.SMS_API_URL;
    if (!smsApiUrl) throw new Error("SMS_API_URL is not configured");
    const headers = process.env.SMS_API_TOKEN
      ? { Authorization: `Bearer ${process.env.SMS_API_TOKEN}` }
      : {};
    await axios.post(smsApiUrl, {
      to: phoneNumber,
      message: `Your password reset code is ${otp}. It expires in 10 minutes.`,
    }, { headers, timeout: 10000 });
  }

  static async storeResetOtp(userId: unknown, otpHash: string) {
    return AuthModel.updateOne({ _id: userId }, {
      $set: { otpHash, otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000), otpVerifiedAt: null },
    });
  }


  static async verifyResetOtp(userId: unknown, role: UserRole, otp: string) {
    const user = await AuthModel.findOne({ _id: userId, role, isDeleted: false })
      .select("+otpHash +otpExpiresAt +otpVerifiedAt");
    if (!user?.otpHash || !user.otpExpiresAt || user.otpExpiresAt.getTime() <= Date.now()) {
      return false;
    }
    if (!(await this.verifySecret(otp, user.otpHash))) return false;
    await AuthModel.updateOne({ _id: userId }, { $set: { otpVerifiedAt: new Date() } });
    return true;
  }
  static async completePasswordReset(userId: unknown, role: UserRole, otp: string, passwordHash: string) {
    const user = await AuthModel.findOne({ _id: userId, role, isDeleted: false })
      .select("+otpHash +otpExpiresAt +otpVerifiedAt");
    if (
      !user?.otpHash ||
      !user.otpExpiresAt ||
      user.otpExpiresAt.getTime() <= Date.now() ||
      !user.otpVerifiedAt ||
      user.otpVerifiedAt.getTime() + 10 * 60 * 1000 <= Date.now()
    ) {
      return false;
    }
    if (!(await this.verifySecret(otp, user.otpHash))) return false;
    await AuthModel.updateOne({ _id: userId }, {
      $set: { password: passwordHash, accessToken: null },
      $unset: { otpHash: 1, otpExpiresAt: 1, otpVerifiedAt: 1 },
    });
    return true;
  }
}






