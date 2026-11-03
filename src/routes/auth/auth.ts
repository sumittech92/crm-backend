import express from "express";
import { forgotPassword, login, logout, createAdmin, createSuperAdmin, register, resetPassword, verifyOtp, changePassword, listUsers, setUserBlocked, getMySite, setUserDomain } from "../../controller/auth.js";
import { verifyAuthToken, requireSuperAdmin } from "../../middleware/authMiddleware.js";
import {
  validateForgotPassword,
  validateLogin,
  validateRegister,
  validateResetPassword,
  validateOtp,
  validateChangePassword,
  validateBlockUser,
  validateDomain,
} from "../../validation/auth.js";

const router = express.Router();

router.post("/register", validateRegister, register);
router.post("/create-superAdmin", validateRegister, createSuperAdmin);
router.post("/create-admin", verifyAuthToken, requireSuperAdmin, validateRegister, createAdmin);
router.post("/login", validateLogin, login);
router.post("/forgot-password", validateForgotPassword, forgotPassword);
router.post("/verify-otp", validateOtp, verifyOtp);
router.post("/reset-password", validateResetPassword, resetPassword);
router.post("/logout", verifyAuthToken, logout);
router.post("/change-password", verifyAuthToken, validateChangePassword, changePassword);
router.get("/site", verifyAuthToken, getMySite);
router.get("/users", verifyAuthToken, requireSuperAdmin, listUsers);
router.patch("/users/:userId/block", verifyAuthToken, requireSuperAdmin, validateBlockUser, setUserBlocked);
router.patch("/users/:userId/domain", verifyAuthToken, requireSuperAdmin, validateDomain, setUserDomain);

export default router;

