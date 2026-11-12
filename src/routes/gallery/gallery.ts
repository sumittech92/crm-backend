import express from "express";
import { addAlbumItems, createAlbum, deleteAlbum, getAlbum, getAlbums, removeAlbumItem, updateAlbum } from "../../controller/gallery/galleryController.js";
import { verifyAuthToken, requireStaff } from "../../middleware/authMiddleware.js";
import { validateAlbumItems, validateCreateAlbum, validateUpdateAlbum } from "../../validation/media.js";

const router = express.Router();

// Gallery albums. Owners manage all; teachers their own albums. Only the owner shows albums on the website.
router.post("/create", verifyAuthToken, requireStaff, validateCreateAlbum, createAlbum);
router.get("/", verifyAuthToken, requireStaff, getAlbums);
router.get("/:albumId", verifyAuthToken, requireStaff, getAlbum);
router.patch("/:albumId", verifyAuthToken, requireStaff, validateUpdateAlbum, updateAlbum);
router.delete("/:albumId", verifyAuthToken, requireStaff, deleteAlbum);
router.post("/:albumId/items", verifyAuthToken, requireStaff, validateAlbumItems, addAlbumItems);
router.delete("/:albumId/items/:itemId", verifyAuthToken, requireStaff, removeAlbumItem);

export default router;
