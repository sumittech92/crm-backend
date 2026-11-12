import mongoose, { Schema, Document, Types } from "mongoose";

export const batchDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const batchStatuses = ["active", "inactive"] as const;

/**
 * Coaching: a batch of a course (name, teachers, weekly days and timing, start / end dates).
 * School: a section of a class ("Section A" of "Class 9") with its class teacher; days and timing are not used.
 * `name` is what students store as their batch / section, so student counts are matched by name.
 */
export interface BatchDocument extends Document {
    batchCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    courseId: Types.ObjectId;
    name: string;
    teacherIds: Types.ObjectId[];
    days: (typeof batchDays)[number][];
    // 24-hour "HH:mm".
    startTime: string | null;
    endTime: string | null;
    startDate: Date | null;
    endDate: Date | null;
    room: string | null;
    capacity: number | null;
    status: (typeof batchStatuses)[number];
}

const batchSchema = new Schema<BatchDocument>(
    {
        batchCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        // Coaching course or school class.
        courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
        name: { type: String, required: true, trim: true },
        // Coaching: every teacher of the batch; school: the class teacher.
        teacherIds: { type: [{ type: Schema.Types.ObjectId, ref: "Teacher" }], default: [] },
        days: { type: [{ type: String, enum: batchDays }], default: [] },
        startTime: { type: String, default: null, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        endTime: { type: String, default: null, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        startDate: { type: Date, default: null },
        endDate: { type: Date, default: null },
        room: { type: String, default: null, trim: true },
        capacity: { type: Number, default: null, min: 1 },
        status: { type: String, enum: batchStatuses, default: "active" },
    },
    { timestamps: true, versionKey: false, collection: "Batches" }
);

const Batch = mongoose.model<BatchDocument>("Batch", batchSchema);

export default Batch;
