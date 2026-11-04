import mongoose, { Schema, Types } from "mongoose";

export const attendanceStatuses = ["present", "absent", "late", "leave"] as const;
export type AttendanceStatus = (typeof attendanceStatuses)[number];

export interface AttendanceDocument extends mongoose.Document {
    adminId: Types.ObjectId | null;
    workType: "school" | "coaching";
    student: Types.ObjectId;
    date: Date;
    status: AttendanceStatus;
    note: string | null;
    markedBy: Types.ObjectId | null;
}

const attendanceSchema = new Schema<AttendanceDocument>(
    {
        // Owner (admin) the student belongs to; copied from the student so owners only see their own registers.
        adminId: {
            type: Schema.Types.ObjectId,
            ref: "Auth",
            default: null,
            index: true,
        },
        workType: {
            type: String,
            enum: ["school", "coaching"],
            required: true,
        },
        student: {
            type: Schema.Types.ObjectId,
            ref: "StudentDetails",
            required: true,
        },
        // Class day, stored at UTC midnight.
        date: {
            type: Date,
            required: true,
        },
        status: {
            type: String,
            enum: attendanceStatuses,
            required: true,
        },
        note: {
            type: String,
            default: null,
            trim: true,
        },
        markedBy: {
            type: Schema.Types.ObjectId,
            ref: "Auth",
            default: null,
        },
    },
    {
        strict: true,
        collection: "Attendance",
        versionKey: false,
        timestamps: true,
    }
);

// One mark per student per day.
attendanceSchema.index({ student: 1, date: 1 }, { unique: true });
attendanceSchema.index({ adminId: 1, date: 1 });

const AttendanceModel = mongoose.model<AttendanceDocument>("Attendance", attendanceSchema);

export default AttendanceModel;
