import mongoose, { Schema, Document, Types } from "mongoose";

export const taskSubmissionStatuses = ["submitted", "checked"] as const;

/** A student's file for an assignment. Re-uploading replaces it until the teacher marks it checked. */
export interface TaskSubmissionDocument extends Document {
    adminId: Types.ObjectId;
    task: Types.ObjectId;
    student: Types.ObjectId;
    file: { url: string; name: string };
    status: (typeof taskSubmissionStatuses)[number];
    remark: string | null;
    checkedBy: Types.ObjectId | null;
    checkedAt: Date | null;
}

const taskSubmissionSchema = new Schema<TaskSubmissionDocument>(
    {
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        task: { type: Schema.Types.ObjectId, ref: "Task", required: true },
        student: { type: Schema.Types.ObjectId, ref: "StudentDetails", required: true, index: true },
        file: { type: new Schema({ url: { type: String, required: true }, name: { type: String, required: true } }, { _id: false }), required: true },
        status: { type: String, enum: taskSubmissionStatuses, default: "submitted" },
        remark: { type: String, default: null, trim: true },
        checkedBy: { type: Schema.Types.ObjectId, ref: "Auth", default: null },
        checkedAt: { type: Date, default: null },
    },
    { timestamps: true, versionKey: false, collection: "TaskSubmissions" }
);

taskSubmissionSchema.index({ task: 1, student: 1 }, { unique: true });

const TaskSubmission = mongoose.model<TaskSubmissionDocument>("TaskSubmission", taskSubmissionSchema);

export default TaskSubmission;
