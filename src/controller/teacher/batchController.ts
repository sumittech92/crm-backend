
import { Request, Response } from "express";
import HttpStatus from "http-status-codes";
import * as batchService from "../../services/teacher/batchServices.js"
import { sendSuccessResponse, sendErrorResponse } from "../../utilis/response.js";

// CREATE BATCH
export const createBatch = async (req: Request, res: Response) => {
    try {
        const batch = await batchService.createBatch(req.body);

        return sendSuccessResponse( res, "Batch created successfully", batch, HttpStatus.CREATED);

    } catch (error: any) {
        return sendErrorResponse(
            res,
            error.message,
            HttpStatus.BAD_REQUEST
        );
    }
};

// GET ALL BATCHES
export const getAllBatches = async (req: Request, res: Response) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);

        const limit = Math.min(
            100,
            Math.max(1, Number(req.query.limit) || 10)
        );

        const search = req.query.search as string | undefined;

        const result = await batchService.getAllBatches(
            page,
            limit,
            search
        );

        return sendSuccessResponse(
            res,
            "Batch list fetched successfully",
            result,
            HttpStatus.OK
        );

    } catch (error: any) {
        return sendErrorResponse(
            res,
            error.message,
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
};

// GET BATCH BY ID
export const getBatchById = async (req: Request, res: Response) => {
    try {
        const batch = await batchService.getBatchById(req.params.id);

        return sendSuccessResponse(
            res,
            "Batch fetched successfully",
            batch,
            HttpStatus.OK
        );

    } catch (error: any) {
        const statusCode = error.message === "Batch not found"
            ? HttpStatus.NOT_FOUND
            : HttpStatus.BAD_REQUEST;

        return sendErrorResponse(
            res,
            error.message,
            statusCode
        );
    }
};

// UPDATE BATCH
export const updateBatch = async (req: Request, res: Response) => {
    try {
        const batch = await batchService.updateBatch(
            req.params.id,
            req.body
        );

        return sendSuccessResponse(
            res,
            "Batch updated successfully",
            batch,
            HttpStatus.OK
        );

    } catch (error: any) {
        const statusCode = error.message === "Batch not found"
            ? HttpStatus.NOT_FOUND
            : HttpStatus.BAD_REQUEST;

        return sendErrorResponse(
            res,
            error.message,
            statusCode
        );
    }
};

// DELETE BATCH
export const deleteBatch = async (req: Request, res: Response) => {
    try {
        const batch = await batchService.deleteBatch(req.params.id);

        return sendSuccessResponse(
            res,
            "Batch deleted successfully",
            batch,
            HttpStatus.OK
        );

    } catch (error: any) {
        const statusCode = error.message === "Batch not found"
            ? HttpStatus.NOT_FOUND
            : HttpStatus.BAD_REQUEST;

        return sendErrorResponse(
            res,
            error.message,
            statusCode
        );
    }
};
