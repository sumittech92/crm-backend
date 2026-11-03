import express from "express";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import HttpStatus from "http-status-codes";
import { verifyAuthToken, requireOwner } from "../../middleware/authMiddleware.js";
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

export default router;
