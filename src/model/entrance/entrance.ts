import mongoose, { Schema, Document, Types } from "mongoose";

/** Classes an admission entrance test can be for (primary only). */
export const primaryClasses = ["Nursery", "LKG", "UKG", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5"] as const;

export interface EntranceCandidate {
    _id?: Types.ObjectId;
    // e.g. "E-482913-007": printed on the admit slip, kept when the list is saved again.
    rollNo: string;
    // Admission enquiry the applicant came from, when picked from Admissions.
    enquiryCode: string | null;
    studentName: string;
    parentName: string | null;
    phoneNumber: string | null;
    // null until marks are entered.
    marks: number | null;
    remarks: string | null;
}

/**
 * Admission entrance test. Schools: new applicants to primary classes (Nursery – Class 5). Coaching: any course (entrance / scholarship test).
 * Status comes from the date: scheduled → completed, or cancelled. A candidate's result comes from marks vs pass marks.
 */
export interface EntranceDocument extends Document {
    entranceCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    name: string;
    // School: one of primaryClasses. Coaching: the course name.
    className: string;
    date: Date;
    startTime: string | null;
    endTime: string | null;
    venue: string | null;
    maxMarks: number;
    passMarks: number;
    instructions: string | null;
    cancelled: boolean;
    candidates: EntranceCandidate[];
}

const time = { type: String, default: null, match: /^([01]\d|2[0-3]):[0-5]\d$/ };

const candidateSchema = new Schema<EntranceCandidate>(
    {
        rollNo: { type: String, required: true },
        enquiryCode: { type: String, default: null },
        studentName: { type: String, required: true, trim: true },
        parentName: { type: String, default: null, trim: true },
        phoneNumber: { type: String, default: null, trim: true },
        marks: { type: Number, default: null, min: 0 },
        remarks: { type: String, default: null, trim: true },
    },
    { _id: true }
);

const entranceSchema = new Schema<EntranceDocument>(
    {
        entranceCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        name: { type: String, required: true, trim: true },
        className: { type: String, required: true, trim: true },
        date: { type: Date, required: true },
        startTime: time,
        endTime: time,
        venue: { type: String, default: null, trim: true },
        maxMarks: { type: Number, required: true, min: 1 },
        passMarks: { type: Number, required: true, min: 0 },
        instructions: { type: String, default: null, trim: true },
        cancelled: { type: Boolean, default: false },
        candidates: { type: [candidateSchema], default: [] },
    },
    { timestamps: true, versionKey: false, collection: "EntranceTests" }
);

const EntranceTest = mongoose.model<EntranceDocument>("EntranceTest", entranceSchema);

export default EntranceTest;
