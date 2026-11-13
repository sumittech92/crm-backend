import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { PostService } from "../../services/post/post.js";
import { staffActor } from "../../utilis/staffAccess.js";

const handleError = (res, error, label) => {
  if (error.statusCode) return sendErrorResponse(res, error.message, error.statusCode);
  console.error(`${label}:`, error);
  return sendErrorResponse(res, "Something went wrong", HttpStatus.INTERNAL_SERVER_ERROR);
};

export const createPost = async (req, res) => {
  try {
    return sendSuccessResponse(
      res,
      "Post created successfully",
      await PostService.createPost(req.body, await staffActor(req), req.userData.fullName ?? null),
      HttpStatus.CREATED,
    );
  } catch (error) {
    return handleError(res, error, "Post creation error");
  }
};

export const getPosts = async (req, res) => {
  try {
    return sendSuccessResponse(
      res,
      "Posts retrieved successfully",
      await PostService.getAllPosts(await staffActor(req)),
    );
  } catch (error) {
    return handleError(res, error, "Post list error");
  }
};

export const updatePost = async (req, res) => {
  try {
    return sendSuccessResponse(
      res,
      "Post updated successfully",
      await PostService.updatePost(req.params.postId, req.body, await staffActor(req)),
    );
  } catch (error) {
    return handleError(res, error, "Post update error");
  }
};

export const deletePost = async (req, res) => {
  try {
    return sendSuccessResponse(
      res,
      "Post deleted successfully",
      await PostService.deletePost(req.params.postId, await staffActor(req)),
    );
  } catch (error) {
    return handleError(res, error, "Post deletion error");
  }
};
