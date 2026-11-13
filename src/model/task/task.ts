import mongoose, { Schema, Document, Types } from "mongoose";

export const taskKinds = ["homework", "assignment"] as const;
export const taskStatuses = ["assigned", "closed"] as const;

/** Homework or an assignment a teacher gives one section (school) or batch (coaching) in one subject. */
export interface TaskDocument extends Document {
    taskCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    kind: (typeof taskKinds)[number];
    // Auth user (owner or teacher) who gave it; teachers manage only their own.
    createdBy: Types.ObjectId;
    title: string;
    batchId: Types.ObjectId;
    subject: string;
    dueDate: Date;
    description: string | null;
    // File uploaded through /upload/material.
    attachment: { url: string; name: string } | null;
    status: (typeof taskStatuses)[number];
}

const taskSchema = new Schema<TaskDocument>(
    {
        taskCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        kind: { type: String, enum: taskKinds, required: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        title: { type: String, required: true, trim: true },
        batchId: { type: Schema.Types.ObjectId, ref: "Batch", required: true, index: true },
        subject: { type: String, required: true, trim: true },
        dueDate: { type: Date, required: true },
        description: { type: String, default: null, trim: true },
        attachment: { type: new Schema({ url: { type: String, required: true }, name: { type: String, required: true } }, { _id: false }), default: null },
        status: { type: String, enum: taskStatuses, default: "assigned" },
    },
    { timestamps: true, versionKey: false, collection: "Tasks" }
);

const Task = mongoose.model<TaskDocument>("Task", taskSchema);

export default Task;
