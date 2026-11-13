import mongoose, { Schema, Document, Types } from "mongoose";

export const sessionStatuses = ["current", "upcoming", "completed"] as const;

/** A school year / academic session ("2026–27", 1 Apr 2026 – 31 Mar 2027, Term 1 and Term 2). One session per institute is current. */
export interface AcademicSessionDocument extends Document {
    sessionCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    name: string;
    startDate: Date;
    endDate: Date;
    terms: string[];
    status: (typeof sessionStatuses)[number];
}

const sessionSchema = new Schema<AcademicSessionDocument>(
    {
        sessionCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        name: { type: String, required: true, trim: true },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        terms: { type: [String], default: [] },
        status: { type: String, enum: sessionStatuses, default: "upcoming" },
    },
    { timestamps: true, versionKey: false, collection: "AcademicSessions" }
);

sessionSchema.index({ adminId: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

const AcademicSession = mongoose.model<AcademicSessionDocument>("AcademicSession", sessionSchema);

export default AcademicSession;
