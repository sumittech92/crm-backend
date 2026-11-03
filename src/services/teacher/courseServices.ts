
import mongoose from "mongoose";
import Course from "../../model/teacher/courseModel.js";

interface CreateCourseInput {
    courseName: string;
    description?: string | null;
    duration?: string | null;
    fee?: string | null;
    subject?: string | null;
    status?: "active" | "inactive";
}

interface UpdateCourseInput {
    courseName?: string | null;
    description?: string | null;
    duration?: string | null;
    fee?: string | null;
    subject?: string | null;
    status?: "active" | "inactive" | null;
}

// CREATE COURSE
export const createCourse = async (data: CreateCourseInput) => {
    const course = await Course.create(data);
    return course;
};

// GET ALL COURSES WITH PAGINATION AND SEARCH
export const getAllCourses = async (
    page: number,
    limit: number,
    search?: string
) => {
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (search?.trim()) {
        filter.$or = [
            { courseName: { $regex: search.trim(), $options: "i" } },
            { subject: { $regex: search.trim(), $options: "i" } },
            { description: { $regex: search.trim(), $options: "i" } }
        ];
    }

    const [courses, total] = await Promise.all([
        Course.find(filter).sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),

        Course.countDocuments(filter)
    ]);

    return {
        courses,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    };
};

// GET COURSE BY ID
export const getCourseById = async (courseId: string) => {
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
        throw new Error("Invalid course ID");
    }

    const course = await Course.findById(courseId);

    if (!course) {
        throw new Error("Course not found");
    }

    return course;
};

// UPDATE COURSE
export const updateCourse = async (
    courseId: string,
    data: UpdateCourseInput
) => {
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
        throw new Error("Invalid course ID");
    }

    const course = await Course.findByIdAndUpdate(
        courseId,
        { $set: data },
        {
            new: true,
            runValidators: true
        }
    );

    if (!course) {
        throw new Error("Course not found");
    }

    return course;
};

// DELETE COURSE
export const deleteCourse = async (courseId: string) => {
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
        throw new Error("Invalid course ID");
    }

    const course = await Course.findByIdAndDelete(courseId);

    if (!course) {
        throw new Error("Course not found");
    }

    return course;
};
