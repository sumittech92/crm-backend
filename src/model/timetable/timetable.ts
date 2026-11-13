import mongoose, { Schema, Document, Types } from "mongoose";
import { batchDays } from "../teacher/batchModel.js";

/**
 * One weekly period of a school section: Mon 08:00–08:40, Class 9 · Section A, Mathematics.
 * The teacher is not stored: it is whoever the subject assigns to that section, so reassigning a subject updates the timetable.
 */
export interface PeriodDocument extends Document {
    periodCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    batchId: Types.ObjectId;
    subjectId: Types.ObjectId;
    day: (typeof batchDays)[number];
    // 24-hour "HH:mm".
    startTime: string;
    endTime: string;
    // Empty means the section's own room.
    room: string | null;
}

const periodSchema = new Schema<PeriodDocument>(
    {
        periodCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true },
        batchId: { type: Schema.Types.ObjectId, ref: "Batch", required: true, index: true },
        subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true, index: true },
        day: { type: String, enum: batchDays, required: true },
        startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        room: { type: String, default: null, trim: true },
    },
    { timestamps: true, versionKey: false, collection: "Timetable" }
);

periodSchema.index({ adminId: 1, day: 1 });

const Period = mongoose.model<PeriodDocument>("Period", periodSchema);

export default Period;
