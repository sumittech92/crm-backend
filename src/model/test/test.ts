import mongoose, { Schema, Document, Types } from "mongoose";

/** One subject paper of a test. Coaching tests have exactly one; a school exam has one per subject (its date sheet). */
export interface TestPaper {
    _id: Types.ObjectId;
    subject: string;
    date: Date;
    maxMarks: number;
    passMarks: number | null;
}

/**
 * School admit cards for an exam. The owner (principal) releases them and decides whether fees must be cleared:
 * with `feeRequired`, a student downloads their own card only when no fee due on or before the first paper is unpaid,
 * unless the owner allowed that student (`allowedStudentIds`). Class teachers and the owner can always download.
 */
export interface AdmitCardSettings {
    released: boolean;
    feeRequired: boolean;
    instructions: string | null;
    // StudentDetails documents the owner let through despite pending fees.
    allowedStudentIds: Types.ObjectId[];
}

/**
 * Coaching: a test for one batch ("Chapter 4 test", Physics, 19 Oct, 50 marks).
 * School: an exam for a class and some or all of its sections ("Term 1 – Mid-term") with a date sheet of papers.
 * Status is worked out from the dates: scheduled → completed → published (or cancelled).
 */
export interface TestDocument extends Document {
    testCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    createdBy: Types.ObjectId;
    name: string;
    // School only: "Term 1", "Term 2", "Annual".
    term: string | null;
    courseId: Types.ObjectId;
    // Coaching: the one batch; school: chosen sections (empty = every section of the class).
    batchIds: Types.ObjectId[];
    papers: Types.DocumentArray<TestPaper & Document>;
    // School: one sitting time for every paper ("09:00"–"12:00", 24-hour).
    startTime: string | null;
    endTime: string | null;
    admitCard: AdmitCardSettings;
    cancelled: boolean;
    resultsPublished: boolean;
    publishedAt: Date | null;
}

const paperSchema = new Schema<TestPaper>(
    {
        subject: { type: String, required: true, trim: true },
        date: { type: Date, required: true },
        maxMarks: { type: Number, required: true, min: 1 },
        passMarks: { type: Number, default: null, min: 0 },
    },
    { _id: true }
);

const admitCardSchema = new Schema<AdmitCardSettings>(
    {
        released: { type: Boolean, default: false },
        feeRequired: { type: Boolean, default: false },
        instructions: { type: String, default: null, trim: true },
        allowedStudentIds: { type: [{ type: Schema.Types.ObjectId, ref: "StudentDetails" }], default: [] },
    },
    { _id: false }
);

const time = { type: String, default: null, match: /^([01]\d|2[0-3]):[0-5]\d$/ };

const testSchema = new Schema<TestDocument>(
    {
        testCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "Auth", required: true },
        name: { type: String, required: true, trim: true },
        term: { type: String, default: null, trim: true },
        courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
        batchIds: { type: [{ type: Schema.Types.ObjectId, ref: "Batch" }], default: [], index: true },
        papers: { type: [paperSchema], validate: [(papers: unknown[]) => papers.length > 0, "Add at least one subject"] },
        startTime: time,
        endTime: time,
        admitCard: { type: admitCardSchema, default: () => ({}) },
        cancelled: { type: Boolean, default: false },
        resultsPublished: { type: Boolean, default: false },
        publishedAt: { type: Date, default: null },
    },
    { timestamps: true, versionKey: false, collection: "Tests" }
);

/** Marks of one student in one paper. `marks` is null while not entered; `absent` students have no marks. */
export interface TestMarkDocument extends Document {
    adminId: Types.ObjectId;
    testId: Types.ObjectId;
    paperId: Types.ObjectId;
    studentId: Types.ObjectId;
    marks: number | null;
    absent: boolean;
    remarks: string | null;
    enteredBy: Types.ObjectId;
}

const testMarkSchema = new Schema<TestMarkDocument>(
    {
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        testId: { type: Schema.Types.ObjectId, ref: "Test", required: true },
        paperId: { type: Schema.Types.ObjectId, required: true },
        // StudentDetails document.
        studentId: { type: Schema.Types.ObjectId, ref: "StudentDetails", required: true },
        marks: { type: Number, default: null, min: 0 },
        absent: { type: Boolean, default: false },
        remarks: { type: String, default: null, trim: true },
        enteredBy: { type: Schema.Types.ObjectId, ref: "Auth", required: true },
    },
    { timestamps: true, versionKey: false, collection: "TestMarks" }
);

testMarkSchema.index({ testId: 1, paperId: 1, studentId: 1 }, { unique: true });

/** Every admit card download: who printed which student's card (student, class teacher or owner) and when. */
export interface AdmitCardLogDocument extends Document {
    adminId: Types.ObjectId;
    testId: Types.ObjectId;
    studentId: Types.ObjectId;
    downloadedBy: Types.ObjectId;
    role: string;
    name: string | null;
    createdAt: Date;
}

const admitCardLogSchema = new Schema<AdmitCardLogDocument>(
    {
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        testId: { type: Schema.Types.ObjectId, ref: "Test", required: true },
        studentId: { type: Schema.Types.ObjectId, ref: "StudentDetails", required: true },
        downloadedBy: { type: Schema.Types.ObjectId, ref: "Auth", required: true },
        role: { type: String, required: true },
        name: { type: String, default: null },
    },
    { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: "AdmitCardLogs" }
);

admitCardLogSchema.index({ testId: 1, studentId: 1, createdAt: -1 });

export const Test = mongoose.model<TestDocument>("Test", testSchema);
export const TestMark = mongoose.model<TestMarkDocument>("TestMark", testMarkSchema);
export const AdmitCardLog = mongoose.model<AdmitCardLogDocument>("AdmitCardLog", admitCardLogSchema);
export default Test;
