import mongoose, { Schema, Document } from "mongoose";

export interface CourseDocument extends Document {
    courseName: string | null;
    description: string | null;
    duration: string | null;
    fee: string | null;
    subject: string | null;
    status: "active" | "inactive" | null;
}

const courseSchema = new Schema<CourseDocument>(
    {
        courseName: {
            type: String,
            default: null,
            trim: true
        },
        description: {
            type: String,
            default: null
        },
        duration: {
            type: String,
            default: null
        },
        fee: {
            type: String,
            default: null
        },
        subject: {
            type: String,
            default: null
        },
        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active"
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

const Course = mongoose.model<CourseDocument>("Course", courseSchema);

export default Course;