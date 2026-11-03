
import mongoose, { Schema, Document } from "mongoose";

export interface BatchDocument extends Document {
    batchName: string;
    courseId: mongoose.Types.ObjectId;
    teacherId: mongoose.Types.ObjectId;
    startDate: Date;
    endDate: Date | null;
    timing: string;
    days: string[];
    room: string | null;
    studentCapacity: number;
    status: "active" | "inactive";
}

const batchSchema = new Schema<BatchDocument>(
    {
        batchName: {
            type: String,
            required: true,
            trim: true
        },
        courseId: {
            type: Schema.Types.ObjectId,
            ref: "Course",
            required: true
        },
        teacherId: {
            type: Schema.Types.ObjectId,
            ref: "Teacher",
            required: true
        },
        startDate: {
            type: Date,
            required: true
        },
        endDate: {
            type: Date,
            default: null
        },
        timing: {
            type: String,
            required: true,
            trim: true
        },
        days: {
            type: [String],
            enum: [ "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
            required: true
        },
        room: {
            type: String,
            default: null,
            trim: true
        },
        studentCapacity: {
            type: Number,
            default: 2,
            min: 1
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

const Batch = mongoose.model<BatchDocument>("Batch", batchSchema);

export default Batch;
