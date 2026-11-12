import HttpStatus from "http-status-codes";
import { sendErrorResponse, sendSuccessResponse } from "../../utilis/response.js";
import { GalleryService } from "../../services/gallery/gallery.js";
import { staffActor } from "../../utilis/staffAccess.js";

const handleError = (res, error, label) => {
  if (error.statusCode) return sendErrorResponse(res, error.message, error.statusCode);
  console.error(`${label}:`, error);
  return sendErrorResponse(res, "Something went wrong", HttpStatus.INTERNAL_SERVER_ERROR);
};

export const createAlbum = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Album created successfully", await GalleryService.createAlbum(req.body, await staffActor(req)), HttpStatus.CREATED);
  } catch (error) { return handleError(res, error, "Album creation error"); }
};

export const getAlbums = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Albums retrieved successfully", await GalleryService.getAllAlbums(await staffActor(req)));
  } catch (error) { return handleError(res, error, "Album list error"); }
};

export const getAlbum = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Album retrieved successfully", await GalleryService.getAlbum(req.params.albumId, await staffActor(req)));
  } catch (error) { return handleError(res, error, "Album lookup error"); }
};

export const updateAlbum = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Album updated successfully", await GalleryService.updateAlbum(req.params.albumId, req.body, await staffActor(req)));
  } catch (error) { return handleError(res, error, "Album update error"); }
};

export const addAlbumItems = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Added to album", await GalleryService.addItems(req.params.albumId, req.body.items, await staffActor(req)));
  } catch (error) { return handleError(res, error, "Album item add error"); }
};

export const removeAlbumItem = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Removed from album", await GalleryService.removeItem(req.params.albumId, req.params.itemId, await staffActor(req)));
  } catch (error) { return handleError(res, error, "Album item removal error"); }
};

export const deleteAlbum = async (req, res) => {
  try {
    return sendSuccessResponse(res, "Album deleted successfully", await GalleryService.deleteAlbum(req.params.albumId, await staffActor(req)));
  } catch (error) { return handleError(res, error, "Album deletion error"); }
};
