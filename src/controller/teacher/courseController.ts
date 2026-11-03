
import { Request, Response } from "express";
import HttpStatus from "http-status-codes";
import * as courseService from "../../services/teacher/courseServices.js"
import { sendSuccessResponse, sendErrorResponse } from "../../utilis/response.js";

// CREATE COURSE
export const createCourse = async (req: Request, res: Response) => {
    try {
        const course = await courseService.createCourse(req.body);

        return sendSuccessResponse( res, "Course created successfully", course, HttpStatus.CREATED);
    } catch (error: any) {
        return sendErrorResponse( res, error.message, HttpStatus.BAD_REQUEST);
    }
};

// GET ALL COURSES
export const getAllCourses = async (req: Request, res: Response) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min( 100, Math.max(1, Number(req.query.limit) || 10));
        const search = req.query.search as string | undefined;
        const result = await courseService.getAllCourses( page, limit, search );
        return sendSuccessResponse( res, "Courses fetched successfully", result, HttpStatus.OK);
    } catch (error: any) {
        return sendErrorResponse(
            res,
            error.message,
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
};

// GET COURSE BY ID
export const getCourseById = async (req: Request, res: Response) => {
    try {
        const course = await courseService.getCourseById(req.params.id);

        return sendSuccessResponse(
            res,
            "Course fetched successfully",
            course,
            HttpStatus.OK
        );
    } catch (error: any) {
        return sendErrorResponse(
            res,
            error.message,
            error.message === "Course not found"
                ? HttpStatus.NOT_FOUND
                : HttpStatus.BAD_REQUEST
        );
    }
};

// UPDATE COURSE
export const updateCourse = async (req: Request, res: Response) => {
    try {
        const course = await courseService.updateCourse(
            req.params.id,
            req.body
        );

        return sendSuccessResponse(
            res,
            "Course updated successfully",
            course,
            HttpStatus.OK
        );
    } catch (error: any) {
        return sendErrorResponse(
            res,
            error.message,
            error.message === "Course not found"
                ? HttpStatus.NOT_FOUND
                : HttpStatus.BAD_REQUEST
        );
    }
};

// DELETE COURSE
export const deleteCourse = async (req: Request, res: Response) => {
    try {
        const course = await courseService.deleteCourse(req.params.id);

        return sendSuccessResponse(
            res,
            "Course deleted successfully",
            course,
            HttpStatus.OK
        );
    } catch (error: any) {
        return sendErrorResponse(
            res,
            error.message,
            error.message === "Course not found"
                ? HttpStatus.NOT_FOUND
                : HttpStatus.BAD_REQUEST
        );
    }
};
