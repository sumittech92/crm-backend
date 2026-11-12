import mongoose, { Schema, Document, Types } from "mongoose";

export const materialTypes = ["pdf", "notes", "assignment", "video", "questionPaper"] as const;
export const materialStatuses = ["published", "draft"] as const;

/** An uploaded file kept under uploads/materials/<ownerId>/. */
export interface MaterialFile { url: string; name: string; size: number; mimeType: string; }

/**
 * A study material for a course (school: class), optionally one batch (school: some sections), and a subject.
 * It is either an uploaded file or a link (videos are always links: YouTube, Drive, Vimeo…).
 */
export interface MaterialDocument extends Document {
    materialCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    createdBy: Types.ObjectId;
    title: string;
    description: string | null;
    courseId: Types.ObjectId;
    batchIds: Types.ObjectId[];
    subject: string | null;
    type: (typeof materialTypes)[number];
    file: MaterialFile | null;
    link: string | null;
    status: (typeof materialStatuses)[number];
    publishedAt: Date | null;
}

const fileSchema = new Schema<MaterialFile>(
    { url: { type: String, required: true }, name: { type: String, required: true }, size: { type: Number, required: true }, mimeType: { type: String, required: true } },
    { _id: false }
);

const materialSchema = new Schema<MaterialDocument>(
    {
        materialCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "Auth", required: true },
        title: { type: String, required: true, trim: true },
        description: { type: String, default: null, trim: true },
        courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
        // Coaching: none (whole course) or one batch; school: none (whole class) or chosen sections.
        batchIds: { type: [{ type: Schema.Types.ObjectId, ref: "Batch" }], default: [], index: true },
        subject: { type: String, default: null, trim: true },
        type: { type: String, enum: materialTypes, required: true },
        file: { type: fileSchema, default: null },
        link: { type: String, default: null, trim: true },
        status: { type: String, enum: materialStatuses, default: "published" },
        publishedAt: { type: Date, default: null },
    },
    { timestamps: true, versionKey: false, collection: "Materials" }
);

const Material = mongoose.model<MaterialDocument>("Material", materialSchema);
export default Material;
