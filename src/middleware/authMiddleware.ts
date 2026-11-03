
import jwt from "jsonwebtoken";
import AuthModel from "../model/Auth/auth.js";

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
