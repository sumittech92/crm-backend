import mongoose, { Schema, Document, Types } from "mongoose";

export const noticeTypes = ["general", "holiday", "exam", "feeReminder", "newBatch", "ptm", "important"] as const;
export const noticeAudiences = ["everyone", "students", "teachers"] as const;
export const noticeStatuses = ["published", "draft"] as const;

/**
 * A notice for everyone, students & parents (optionally one course / class and some batches / sections) or teachers.
 * Its visible state follows the dates: scheduled (before publishDate) → live → expired (after expiryDate).
 */
export interface NoticeDocument extends Document {
    noticeCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    createdBy: Types.ObjectId;
    title: string;
    description: string;
    type: (typeof noticeTypes)[number];
    audience: (typeof noticeAudiences)[number];
    courseId: Types.ObjectId | null;
    batchIds: Types.ObjectId[];
    publishDate: Date;
    expiryDate: Date | null;
    pinned: boolean;
    showOnWebsite: boolean;
    status: (typeof noticeStatuses)[number];
}

const noticeSchema = new Schema<NoticeDocument>(
    {
        noticeCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "Auth", required: true },
        title: { type: String, required: true, trim: true },
        description: { type: String, required: true, trim: true },
        type: { type: String, enum: noticeTypes, default: "general" },
        audience: { type: String, enum: noticeAudiences, default: "everyone" },
        courseId: { type: Schema.Types.ObjectId, ref: "Course", default: null },
        batchIds: { type: [{ type: Schema.Types.ObjectId, ref: "Batch" }], default: [] },
        publishDate: { type: Date, required: true },
        expiryDate: { type: Date, default: null },
        pinned: { type: Boolean, default: false },
        showOnWebsite: { type: Boolean, default: false },
        status: { type: String, enum: noticeStatuses, default: "published" },
    },
    { timestamps: true, versionKey: false, collection: "Notices" }
);

noticeSchema.index({ adminId: 1, showOnWebsite: 1, status: 1 });

const Notice = mongoose.model<NoticeDocument>("Notice", noticeSchema);
export default Notice;
