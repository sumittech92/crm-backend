import mongoose, { Schema, Document, Types } from "mongoose";

export const postTypes = ["image", "video", "text", "announcement"] as const;
export const postStatuses = ["published", "draft"] as const;

/** A post in the institute's feed: text or announcement, an uploaded image, or a video link. */
export interface PostDocument extends Document {
    postCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    createdBy: Types.ObjectId;
    authorName: string | null;
    title: string;
    description: string;
    type: (typeof postTypes)[number];
    imageUrl: string | null;
    videoLink: string | null;
    publishDate: Date;
    pinned: boolean;
    showOnWebsite: boolean;
    status: (typeof postStatuses)[number];
}

const postSchema = new Schema<PostDocument>(
    {
        postCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "Auth", required: true },
        authorName: { type: String, default: null, trim: true },
        title: { type: String, required: true, trim: true },
        description: { type: String, required: true, trim: true },
        type: { type: String, enum: postTypes, default: "text" },
        imageUrl: { type: String, default: null },
        videoLink: { type: String, default: null, trim: true },
        publishDate: { type: Date, required: true },
        pinned: { type: Boolean, default: false },
        showOnWebsite: { type: Boolean, default: false },
        status: { type: String, enum: postStatuses, default: "published" },
    },
    { timestamps: true, versionKey: false, collection: "Posts" }
);

const Post = mongoose.model<PostDocument>("Post", postSchema);
export default Post;
