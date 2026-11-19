
import jwt from "jsonwebtoken";
import AuthModel from "../model/Auth/auth.js";
import { MODULE_LABELS, SUSPENDED_MESSAGE, instituteAccessFor, moduleForPath } from "../utilis/moduleAccess.js";

export const verifyAuthToken = async (req, res, next) => {
  try {
    const accessToken = req.headers.accesstoken || req.headers.authorization?.replace(/^Bearer\s+/i, "");

    if (!accessToken) {
      return res.status(401).json({
        auth: false,
        message: "No token provided",
      });
    }

    const decoded = jwt.verify( accessToken, process.env.SECRET_KEY );

    const allowedRoles = [ "superAdmin", "admin", "teacher", "student", "parent" ];

    if (!allowedRoles.includes(decoded.role)) {
      return res.status(403).json({
        auth: false,
        message: "Invalid user role",
      });
    }

    const user = await AuthModel.findOne({ accessToken, role: decoded.role, isDeleted: false}).lean();

    if (!user) {
      return res.status(401).json({
        auth: false,
        message: "Invalid token or user has been logged out",
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        auth: false,
        message: "Your account is blocked by Admin",
      });
    }

    req.tokenData = decoded;
    req.userData = user;
    req.role = decoded.role;

    // Modules the Super Admin turned off for this institute can't be used by its owner or teachers.
    if (["admin", "teacher", "student"].includes(decoded.role)) {
      const access = await instituteAccessFor(user);
      // A workspace deactivated by the Super Admin can't be used by its owner, teachers or students (signing out still works).
      if (access.suspended && !req.originalUrl.endsWith("/auth/logout")) {
        return res.status(403).json({ auth: false, message: SUSPENDED_MESSAGE });
      }
      // Modules the Super Admin turned off can't be used by the owner or teachers. Website reads stay open: the panel loads the logo and name from it.
      const module = decoded.role !== "student" ? moduleForPath(req.baseUrl) : undefined;
      if (module && !(module === "website" && req.method === "GET") && access.disabledModules.includes(module)) {
        return res.status(403).json({
          auth: true,
          message: `${MODULE_LABELS[module]} is not enabled for your institute. Contact EduNexa support to turn it on.`,
        });
      }
    }

    next();
  } catch (error) {
    if (
      error.name === "TokenExpiredError" || error.name === "JsonWebTokenError" || error.name === "NotBeforeError") {
      return res.status(401).json({
        auth: false,
        message:
        error.name === "TokenExpiredError" ? "Token has expired": "Invalid token",
      });
    }

    console.error(error);

    return res.status(500).json({
      auth: false,
      message: "Internal server error",
    });
  }
};




export const requireSuperAdmin = (req, res, next) => {
  if (req.role !== "superAdmin") {
    return res.status(403).json({ auth: false, message: "Super-admin access required" });
  }
  return next();
};

export const requireAdmin = (req, res, next) => {
  if (req.role !== "admin" && req.role !== "superAdmin") {
    return res.status(403).json({ auth: false, message: "Admin access required" });
  }
  return next();
};

export const requireMatchingWorkType = (req, res, next) => {
  if (req.role !== "admin") return next();
  const workType = req.userData?.workType;
  if (workType !== "school" && workType !== "coaching") {
    return res.status(403).json({ auth: false, message: "Admin work type is not configured" });
  }

  const allowedInfo = workType === "school" ? "schoolInfo" : "coachingInfo";
  const blockedInfo = workType === "school" ? "coachingInfo" : "schoolInfo";
  if (req.body?.[blockedInfo] !== undefined) {
    return res.status(403).json({ auth: false, message: `A ${workType} admin can only manage ${workType} records` });
  }
  if (req.method === "POST" && req.body?.[allowedInfo] === undefined) {
    return res.status(400).json({ auth: false, message: `${allowedInfo} is required for this admin work type` });
  }
  return next();
};

// Owner-only features (website, uploads): super admins act on owners through their own routes.
export const requireOwner = (req, res, next) => {
  if (req.role !== "admin") {
    return res.status(403).json({ auth: false, message: "Owner access required" });
  }
  return next();
};

// Owners, their teachers and super admins (attendance and other day-to-day staff work).
export const requireStaff = (req, res, next) => {
  if (!["admin", "superAdmin", "teacher"].includes(req.role)) {
    return res.status(403).json({ auth: false, message: "Staff access required" });
  }
  return next();
};
