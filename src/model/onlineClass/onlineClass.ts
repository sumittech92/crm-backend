import mongoose, { Schema, Document, Types } from "mongoose";

/** A Google Meet link: https://meet.google.com/abc-defg-hij */
export const MEET_LINK = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\?[^\s]*)?$/;

export interface ClassJoin { student: Types.ObjectId; name: string; joinedAt: Date; }

/**
 * A live online class on Google Meet for one or more sections / batches. Classes made together with "repeat weekly"
 * share a seriesId. Status comes from the date and time: scheduled → live → completed, or cancelled.
 */
export interface OnlineClassDocument extends Document {
    classCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    batchIds: Types.ObjectId[];
    subject: string;
    topic: string;
    // The Teacher profile taking the class.
    teacher: Types.ObjectId | null;
    teacherName: string | null;
    date: Date;
    // 24-hour "HH:mm"
    startTime: string;
    endTime: string;
    meetLink: string;
    description: string | null;
    recordingLink: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    cancelled: boolean;
    seriesId: string | null;
    joins: ClassJoin[];
}

const time = { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ };

const onlineClassSchema = new Schema<OnlineClassDocument>(
    {
        classCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        batchIds: { type: [{ type: Schema.Types.ObjectId, ref: "Batch" }], default: [] },
        subject: { type: String, required: true, trim: true },
        topic: { type: String, required: true, trim: true },
        teacher: { type: Schema.Types.ObjectId, ref: "Teacher", default: null },
        teacherName: { type: String, default: null, trim: true },
        date: { type: Date, required: true },
        startTime: time,
        endTime: time,
        meetLink: { type: String, required: true, trim: true, match: MEET_LINK },
        description: { type: String, default: null, trim: true },
        recordingLink: { type: String, default: null, trim: true },
        startedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        cancelled: { type: Boolean, default: false },
        seriesId: { type: String, default: null },
        joins: {
            type: [new Schema<ClassJoin>({ student: { type: Schema.Types.ObjectId, ref: "StudentDetails", required: true }, name: { type: String, default: "" }, joinedAt: { type: Date, required: true } }, { _id: false })],
            default: [],
        },
    },
    { timestamps: true, versionKey: false, collection: "OnlineClasses" }
);
onlineClassSchema.index({ adminId: 1, date: 1 });

const OnlineClass = mongoose.model<OnlineClassDocument>("OnlineClass", onlineClassSchema);

export default OnlineClass;
