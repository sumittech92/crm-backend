import express from "express";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import HttpStatus from "http-status-codes";
import { verifyAuthToken, requireOwner, requireStaff } from "../../middleware/authMiddleware.js";
import { resolveOwnerScope } from "../../utilis/ownerScope.js";
import StudentDetailsModel from "../../model/students/studentInfo.js";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";

export const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
const VIDEO_TYPES: Record<string, string> = { "video/mp4": ".mp4", "video/webm": ".webm" };
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

// Files go to uploads/website/<ownerId>/<random name>; the extension comes from the checked type, never the file name.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(UPLOAD_ROOT, "website", String(req.userData._id));
      fs.mkdir(dir, { recursive: true }, (error) => cb(error, dir));
    },
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${IMAGE_TYPES[file.mimetype] ?? VIDEO_TYPES[file.mimetype]}`),
  }),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype] || VIDEO_TYPES[file.mimetype]) return cb(null, true);
    return cb(Object.assign(new Error("Upload a JPG, PNG, WebP or GIF image, or an MP4 / WebM video"), { statusCode: HttpStatus.BAD_REQUEST }));
  },
});

const router = express.Router();

router.post("/website", verifyAuthToken, requireOwner, (req, res) => {
  upload.single("file")(req, res, (error) => {
    if (error) {
      const message = error.code === "LIMIT_FILE_SIZE" ? "Videos must be 20 MB or smaller" : error.statusCode ? error.message : "Upload failed";
      if (!error.statusCode && error.code !== "LIMIT_FILE_SIZE") console.error("Upload error:", error);
      return sendErrorResponse(res, message, error.statusCode ?? HttpStatus.BAD_REQUEST);
    }
    const file = req.file;
    if (!file) return sendErrorResponse(res, "Choose a file to upload", HttpStatus.BAD_REQUEST);
    if (IMAGE_TYPES[file.mimetype] && file.size > MAX_IMAGE_BYTES) {
      fs.unlink(file.path, () => {});
      return sendErrorResponse(res, "Images must be 2 MB or smaller", HttpStatus.BAD_REQUEST);
    }
    const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || `${req.protocol}://${req.get("host")}`;
    const url = `${base}/uploads/website/${req.userData._id}/${file.filename}`;
    return sendSuccessResponse(res, "File uploaded", { url, type: IMAGE_TYPES[file.mimetype] ? "image" : "video", size: file.size }, HttpStatus.CREATED);
  });
});

// Study material files: documents and images up to 25 MB, stored under uploads/materials/<ownerId>/ (teachers upload into their institute's folder).
const MATERIAL_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/plain": ".txt",
  ...IMAGE_TYPES,
};
const MAX_MATERIAL_BYTES = 25 * 1024 * 1024;
const materialUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(UPLOAD_ROOT, "materials", String(req.materialOwnerId));
      fs.mkdir(dir, { recursive: true }, (error) => cb(error, dir));
    },
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${MATERIAL_TYPES[file.mimetype]}`),
  }),
  limits: { fileSize: MAX_MATERIAL_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (MATERIAL_TYPES[file.mimetype]) return cb(null, true);
    return cb(Object.assign(new Error("Upload a PDF, Word, PowerPoint, Excel, text or image file. Add videos as a link."), { statusCode: HttpStatus.BAD_REQUEST }));
  },
});

router.post("/material", verifyAuthToken, requireStaff, async (req, res) => {
  try {
    const { adminId } = await resolveOwnerScope(req);
    if (!adminId) return sendErrorResponse(res, "Only an Owner or teacher can upload materials", HttpStatus.FORBIDDEN);
    req.materialOwnerId = adminId;
  } catch (error) {
    return sendErrorResponse(res, error.message, error.statusCode ?? HttpStatus.FORBIDDEN);
  }
  materialUpload.single("file")(req, res, (error) => {
    if (error) {
      const message = error.code === "LIMIT_FILE_SIZE" ? "Files must be 25 MB or smaller" : error.statusCode ? error.message : "Upload failed";
      if (!error.statusCode && error.code !== "LIMIT_FILE_SIZE") console.error("Material upload error:", error);
      return sendErrorResponse(res, message, error.statusCode ?? HttpStatus.BAD_REQUEST);
    }
    const file = req.file;
    if (!file) return sendErrorResponse(res, "Choose a file to upload", HttpStatus.BAD_REQUEST);
    const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || `${req.protocol}://${req.get("host")}`;
    const name = String(file.originalname || "file").replace(/[\\/]/g, "_").slice(0, 200);
    return sendSuccessResponse(res, "File uploaded", { url: `${base}/uploads/materials/${req.materialOwnerId}/${file.filename}`, name, size: file.size, mimeType: file.mimetype }, HttpStatus.CREATED);
  });
});

// Post and gallery photos: JPG, PNG, WebP or GIF up to 5 MB, stored under uploads/media/<ownerId>/ (videos are added as links).
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(UPLOAD_ROOT, "media", String(req.mediaOwnerId));
      fs.mkdir(dir, { recursive: true }, (error) => cb(error, dir));
    },
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${IMAGE_TYPES[file.mimetype]}`),
  }),
  limits: { fileSize: MAX_MEDIA_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) return cb(null, true);
    return cb(Object.assign(new Error("Upload a JPG, PNG, WebP or GIF photo. Add videos as a link."), { statusCode: HttpStatus.BAD_REQUEST }));
  },
});

router.post("/media", verifyAuthToken, requireStaff, async (req, res) => {
  try {
    const { adminId } = await resolveOwnerScope(req);
    if (!adminId) return sendErrorResponse(res, "Only an Owner or teacher can upload photos", HttpStatus.FORBIDDEN);
    req.mediaOwnerId = adminId;
  } catch (error) {
    return sendErrorResponse(res, error.message, error.statusCode ?? HttpStatus.FORBIDDEN);
  }
  mediaUpload.single("file")(req, res, (error) => {
    if (error) {
      const message = error.code === "LIMIT_FILE_SIZE" ? "Photos must be 5 MB or smaller" : error.statusCode ? error.message : "Upload failed";
      if (!error.statusCode && error.code !== "LIMIT_FILE_SIZE") console.error("Media upload error:", error);
      return sendErrorResponse(res, message, error.statusCode ?? HttpStatus.BAD_REQUEST);
    }
    const file = req.file;
    if (!file) return sendErrorResponse(res, "Choose a photo to upload", HttpStatus.BAD_REQUEST);
    const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || `${req.protocol}://${req.get("host")}`;
    return sendSuccessResponse(res, "Photo uploaded", { url: `${base}/uploads/media/${req.mediaOwnerId}/${file.filename}`, size: file.size }, HttpStatus.CREATED);
  });
});

// Student / parent files from the portal: assignment work and fee payment proof (PDF, Word or image up to 10 MB),
// stored under uploads/portal/<ownerId>/.
const PORTAL_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};
const MAX_PORTAL_BYTES = 10 * 1024 * 1024;
const portalUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(UPLOAD_ROOT, "portal", String(req.portalOwnerId));
      fs.mkdir(dir, { recursive: true }, (error) => cb(error, dir));
    },
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${PORTAL_TYPES[file.mimetype]}`),
  }),
  limits: { fileSize: MAX_PORTAL_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (PORTAL_TYPES[file.mimetype]) return cb(null, true);
    return cb(Object.assign(new Error("Upload a PDF, DOC, DOCX, JPG or PNG file"), { statusCode: HttpStatus.BAD_REQUEST }));
  },
});

router.post("/portal", verifyAuthToken, async (req, res) => {
  if (req.role !== "student" && req.role !== "parent") return sendErrorResponse(res, "Only students and parents upload here", HttpStatus.FORBIDDEN);
  const profile = await StudentDetailsModel.findOne(req.role === "parent" ? { parentId: req.userData._id } : { studentId: req.userData._id }).select("adminId").lean();
  if (!profile?.adminId) return sendErrorResponse(res, "Your account is not linked to an institute", HttpStatus.FORBIDDEN);
  req.portalOwnerId = profile.adminId;
  portalUpload.single("file")(req, res, (error) => {
    if (error) {
      const message = error.code === "LIMIT_FILE_SIZE" ? "Files must be 10 MB or smaller" : error.statusCode ? error.message : "Upload failed";
      if (!error.statusCode && error.code !== "LIMIT_FILE_SIZE") console.error("Portal upload error:", error);
      return sendErrorResponse(res, message, error.statusCode ?? HttpStatus.BAD_REQUEST);
    }
    const file = req.file;
    if (!file) return sendErrorResponse(res, "Choose a file to upload", HttpStatus.BAD_REQUEST);
    const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || `${req.protocol}://${req.get("host")}`;
    const name = String(file.originalname || "file").replace(/[\\/]/g, "_").slice(0, 200);
    return sendSuccessResponse(res, "File uploaded", { url: `${base}/uploads/portal/${req.portalOwnerId}/${file.filename}`, name, size: file.size }, HttpStatus.CREATED);
  });
});

export default router;
