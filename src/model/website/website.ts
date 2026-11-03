import mongoose, { Types } from "mongoose";

export const websiteObjectSections = ["settings", "home", "about", "contact", "social"] as const;
export const websiteListSections = ["courses", "faculty", "results", "gallery", "updates"] as const;

type TextMap = Record<string, string>;

/** An owner's public website. Sections are plain text maps edited on the Website page; list items carry status "Published" / "Draft". */
export interface WebsiteDocument extends mongoose.Document {
    adminId: Types.ObjectId;
    workType: "school" | "coaching";
    isPublished: boolean;
    publishedAt: Date | null;
    settings: TextMap;
    home: TextMap;
    about: TextMap;
    contact: TextMap;
    social: TextMap;
    courses: TextMap[];
    faculty: TextMap[];
    results: TextMap[];
    gallery: TextMap[];
    updates: TextMap[];
}

const textMap = { type: mongoose.Schema.Types.Mixed, default: () => ({}) };
const textList = { type: [mongoose.Schema.Types.Mixed], default: () => [] };

const websiteSchema = new mongoose.Schema<WebsiteDocument>(
    {
        adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Auth", required: true, unique: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        // Hidden until the owner publishes it: not listed, "not found" for visitors, no enquiries.
        isPublished: { type: Boolean, default: false, index: true },
        publishedAt: { type: Date, default: null },
        settings: textMap,
        home: textMap,
        about: textMap,
        contact: textMap,
        social: textMap,
        courses: textList,
        faculty: textList,
        results: textList,
        gallery: textList,
        updates: textList,
    },
    { timestamps: true, versionKey: false, collection: "Websites", minimize: false },
);

const Website = mongoose.model<WebsiteDocument>("Website", websiteSchema);
export default Website;
