import mongoose, { Schema, Document, Types } from "mongoose";

export const eventAudiences = ["all", "students", "parents", "staff"] as const;

/** A school event (sports day, parent–teacher meeting). Status is worked out from the date: upcoming → completed, or cancelled. */
export interface EventDocument extends Document {
    eventCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    name: string;
    date: Date;
    // 24-hour "HH:mm", optional.
    startTime: string | null;
    venue: string | null;
    audience: (typeof eventAudiences)[number];
    description: string | null;
    cancelled: boolean;
}

const eventSchema = new Schema<EventDocument>(
    {
        eventCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        name: { type: String, required: true, trim: true },
        date: { type: Date, required: true },
        startTime: { type: String, default: null, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        venue: { type: String, default: null, trim: true },
        audience: { type: String, enum: eventAudiences, default: "all" },
        description: { type: String, default: null, trim: true },
        cancelled: { type: Boolean, default: false },
    },
    { timestamps: true, versionKey: false, collection: "Events" }
);

const SchoolEvent = mongoose.model<EventDocument>("Event", eventSchema);

export default SchoolEvent;
