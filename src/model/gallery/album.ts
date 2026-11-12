import mongoose, { Schema, Document, Types } from "mongoose";

export const albumStatuses = ["published", "draft"] as const;

/** One photo (uploaded) or video (link) in an album. */
export interface AlbumItem { _id: Types.ObjectId; kind: "image" | "video"; url: string; caption: string | null; size: number | null; }

/** A gallery album: many photos and video links, one of them the cover. */
export interface AlbumDocument extends Document {
    albumCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    createdBy: Types.ObjectId;
    name: string;
    description: string | null;
    date: Date;
    items: Types.DocumentArray<AlbumItem & Document>;
    coverItemId: Types.ObjectId | null;
    showOnWebsite: boolean;
    status: (typeof albumStatuses)[number];
}

export const MAX_ALBUM_ITEMS = 50;

const itemSchema = new Schema<AlbumItem>(
    {
        kind: { type: String, enum: ["image", "video"], required: true },
        url: { type: String, required: true },
        caption: { type: String, default: null, trim: true },
        size: { type: Number, default: null },
    },
    { _id: true, timestamps: false }
);

const albumSchema = new Schema<AlbumDocument>(
    {
        albumCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "Auth", required: true },
        name: { type: String, required: true, trim: true },
        description: { type: String, default: null, trim: true },
        date: { type: Date, required: true },
        items: { type: [itemSchema], default: [] },
        coverItemId: { type: Schema.Types.ObjectId, default: null },
        showOnWebsite: { type: Boolean, default: false },
        status: { type: String, enum: albumStatuses, default: "published" },
    },
    { timestamps: true, versionKey: false, collection: "GalleryAlbums" }
);

const Album = mongoose.model<AlbumDocument>("Album", albumSchema);
export default Album;
