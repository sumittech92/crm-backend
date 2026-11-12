import express from "express";
import { createPost, deletePost, getPosts, updatePost } from "../../controller/post/postController.js";
import { verifyAuthToken, requireStaff } from "../../middleware/authMiddleware.js";
import { validateCreatePost, validateUpdatePost } from "../../validation/media.js";

const router = express.Router();

// Posts & updates. Owners manage all; teachers their own posts. Only the owner shows posts on the website.
router.post("/create", verifyAuthToken, requireStaff, validateCreatePost, createPost);
router.get("/", verifyAuthToken, requireStaff, getPosts);
router.patch("/:postId", verifyAuthToken, requireStaff, validateUpdatePost, updatePost);
router.delete("/:postId", verifyAuthToken, requireStaff, deletePost);

export default router;
