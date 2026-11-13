import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import axios from "axios";
import AuthModel, { type UserRole } from "../../model/Auth/auth.js";
import Teacher from "../../model/teacher/teacherInfo.js";
import StudentDetailsModel from "../../model/students/studentInfo.js";

export const MAX_FAILED_LOGINS = 8;
// Safe account fields for the Super Admin users page.
const USER_LIST_FIELDS = "fullName email countryCode phoneNumber role workType instituteName siteSlug customDomain isBlocked failedLoginAttempts createdAt lastLogin";
// The demo websites keep these addresses; real owners never get them.
const RESERVED_SITE_SLUGS = ["northstar-academy", "greenfield-school"];

const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "") || "institute";

const scrypt = promisify(scryptCallback);

export class AuthClass {
  static async create({ fullName, email, password, countryCode, phoneNumber, role = "student", workType, instituteName }: { fullName: string; email: string; password: string; countryCode: string; phoneNumber: string; role?: UserRole; workType?: "school" | "coaching"; instituteName?: string }) {
    const user = await AuthModel.create({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      password,
      countryCode: countryCode.trim(),
      phoneNumber: phoneNumber.trim(),
      role,
      workType: role === "admin" ? workType : null,
      instituteName: role === "admin" ? instituteName?.trim() || null : null,
    });
    const result = user.toObject();
    delete result.password;
    if (role === "admin") result.siteSlug = await this.ensureSiteSlug(result);
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
    return AuthModel.updateOne({ _id: userId }, { $set: { accessToken, lastLogin: Date.now(), failedLoginAttempts: 0 } });
  }

  /**
   * Owner sets a new login password for one of their teachers / students (or a sample account). A lock from too many
   * wrong passwords is lifted too; a block the super admin set stays.
   */
  static async resetPassword(userId: unknown, password: string) {
    const user = await AuthModel.findById(userId).select("failedLoginAttempts").lean();
    const lockedOut = (user?.failedLoginAttempts ?? 0) >= MAX_FAILED_LOGINS;
    await AuthModel.updateOne({ _id: userId }, { $set: { password: await this.hashSecret(password), failedLoginAttempts: 0, ...(lockedOut ? { isBlocked: false } : {}) } });
  }

  /** Counts a wrong password and blocks the account on the MAX_FAILED_LOGINS-th one in a row. Returns the new count. */
  static async recordFailedLogin(userId: unknown) {
    const user = await AuthModel.findOneAndUpdate(
      { _id: userId },
      { $inc: { failedLoginAttempts: 1 } },
      { new: true },
    ).select("failedLoginAttempts").lean();
    const attempts = user?.failedLoginAttempts ?? 0;
    if (attempts >= MAX_FAILED_LOGINS) {
      await AuthModel.updateOne({ _id: userId }, { $set: { isBlocked: true, accessToken: null } });
    }
    return attempts;
  }

  /** Teachers and students made before work types were stored on the account take it from their profile. */
  static async resolveWorkType(user: { _id: unknown; role?: string | null; workType?: string | null }) {
    if (user.workType || (user.role !== "teacher" && user.role !== "student")) return user.workType ?? null;
    const profile = user.role === "teacher"
      ? await Teacher.findOne({ teacherId: user._id }).select("workType").lean()
      : await StudentDetailsModel.findOne({ studentId: user._id }).select("workType").lean();
    if (!profile?.workType) return null;
    await AuthModel.updateOne({ _id: user._id }, { $set: { workType: profile.workType } });
    return profile.workType;
  }

  /** Gives an owner a unique public website address made from the institute name (or their own name). */
  static async ensureSiteSlug(user: { _id: unknown; role?: string | null; siteSlug?: string | null; instituteName?: string | null; fullName?: string | null }) {
    if (user.role !== "admin") return null;
    if (user.siteSlug) return user.siteSlug;
    const base = slugify(user.instituteName || user.fullName || "");
    for (let n = 1; n <= 50; n++) {
      const siteSlug = n === 1 ? base : `${base}-${n}`;
      if (RESERVED_SITE_SLUGS.includes(siteSlug) || await AuthModel.exists({ siteSlug })) continue;
      try {
        const updated = await AuthModel.findOneAndUpdate({ _id: user._id, siteSlug: null }, { $set: { siteSlug } }, { new: true }).select("siteSlug").lean();
        // Another request may have set it first; keep whichever slug was saved.
        return updated?.siteSlug ?? (await AuthModel.findById(user._id).select("siteSlug").lean())?.siteSlug ?? null;
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
    }
    throw new Error("Unable to generate a website address");
  }

  static async changePassword(userId: unknown, currentPassword: string, newPassword: string) {
    const user = await AuthModel.findOne({ _id: userId, isDeleted: false }).select("password").lean();
    if (!user || !(await this.verifySecret(currentPassword, user.password))) return false;
    await AuthModel.updateOne({ _id: userId }, { $set: { password: await this.hashSecret(newPassword) } });
    return true;
  }

  /** Every account except super admins, for the Super Admin users page. */
  static async listUsers({ role, status, search }: { role?: string; status?: string; search?: string }) {
    const filter: Record<string, any> = { isDeleted: false, role: role && role !== "superAdmin" ? role : { $ne: "superAdmin" } };
    if (status === "blocked") filter.isBlocked = true;
    if (status === "active") filter.isBlocked = false;
    if (search?.trim()) {
      const value = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ fullName: value }, { email: value }, { phoneNumber: value }];
    }
    return AuthModel.find(filter)
      .select(USER_LIST_FIELDS)
      .sort({ createdAt: -1 })
      .lean();
  }

  /** Unblocking also clears the wrong-password count; blocking signs the account out. */
  static async setBlocked(userId: unknown, isBlocked: boolean) {
    return AuthModel.findOneAndUpdate(
      { _id: userId, isDeleted: false, role: { $ne: "superAdmin" } },
      { $set: isBlocked ? { isBlocked, accessToken: null } : { isBlocked, failedLoginAttempts: 0 } },
      { new: true },
    ).select(USER_LIST_FIELDS).lean();
  }

  /** Super Admin sets (or clears with null) the domain that opens an owner's website. */
  static async setCustomDomain(userId: unknown, customDomain: string | null) {
    if (customDomain && await AuthModel.exists({ _id: { $ne: userId }, customDomain })) {
      throw Object.assign(new Error("This domain is already used by another institute"), { statusCode: 409 });
    }
    return AuthModel.findOneAndUpdate(
      { _id: userId, isDeleted: false, role: "admin" },
      { $set: { customDomain } },
      { new: true },
    ).select(USER_LIST_FIELDS).lean();
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






