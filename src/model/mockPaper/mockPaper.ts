import mongoose, { Schema, Document, Types } from "mongoose";

export const PAPER_BOARDS = ["CBSE", "ICSE", "UP Board", "State Board"] as const;
export const PAPER_CLASSES = ["Class 9", "Class 10", "Class 11", "Class 12"] as const;
export const PAPER_KINDS = ["chapter", "full"] as const;
export const PAPER_LENGTHS = ["short", "standard", "board"] as const;
export const PAPER_DIFFICULTIES = ["easy", "medium", "hard", "mixed"] as const;
export const QUESTION_TYPES = ["mcq", "assertionReason", "veryShort", "short", "long", "caseBased"] as const;

/** Students may download the same paper this many times; staff are not limited. */
export const MAX_PAPER_DOWNLOADS = 3;

export interface PaperQuestion { number: number; type: (typeof QUESTION_TYPES)[number]; text: string; options: string[]; marks: number; answer: string; explanation: string; }
export interface PaperSection { name: string; description: string; questions: PaperQuestion[]; }

/** A mock test paper written by Claude for a board, class (9–12), subject and chapters, with its answer key. */
export interface MockPaperDocument extends Document {
    paperCode: string;
    adminId: Types.ObjectId;
    // Auth account that made it, and as whom.
    createdBy: Types.ObjectId;
    createdByRole: "student" | "teacher" | "admin";
    createdByName: string;
    // Students only: their student record (so the school can see who practised).
    studentId: Types.ObjectId | null;
    board: (typeof PAPER_BOARDS)[number];
    className: (typeof PAPER_CLASSES)[number];
    subject: string;
    kind: (typeof PAPER_KINDS)[number];
    chapters: string[];
    length: (typeof PAPER_LENGTHS)[number];
    difficulty: (typeof PAPER_DIFFICULTIES)[number];
    title: string;
    instructions: string[];
    sections: PaperSection[];
    totalMarks: number;
    durationMinutes: number;
    downloads: number;
    lastDownloadedAt: Date | null;
}

const questionSchema = new Schema<PaperQuestion>(
    {
        number: { type: Number, required: true },
        type: { type: String, enum: QUESTION_TYPES, required: true },
        text: { type: String, required: true },
        options: { type: [String], default: [] },
        marks: { type: Number, required: true, min: 0 },
        answer: { type: String, default: "" },
        explanation: { type: String, default: "" },
    },
    { _id: false }
);

const paperSchema = new Schema<MockPaperDocument>(
    {
        paperCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        createdByRole: { type: String, enum: ["student", "teacher", "admin"], required: true },
        createdByName: { type: String, default: "", trim: true },
        studentId: { type: Schema.Types.ObjectId, ref: "StudentDetails", default: null },
        board: { type: String, enum: PAPER_BOARDS, required: true },
        className: { type: String, enum: PAPER_CLASSES, required: true },
        subject: { type: String, required: true, trim: true },
        kind: { type: String, enum: PAPER_KINDS, required: true },
        chapters: { type: [String], default: [] },
        length: { type: String, enum: PAPER_LENGTHS, required: true },
        difficulty: { type: String, enum: PAPER_DIFFICULTIES, required: true },
        title: { type: String, required: true, trim: true },
        instructions: { type: [String], default: [] },
        sections: {
            type: [new Schema<PaperSection>({ name: { type: String, required: true }, description: { type: String, default: "" }, questions: { type: [questionSchema], default: [] } }, { _id: false })],
            default: [],
        },
        totalMarks: { type: Number, required: true },
        durationMinutes: { type: Number, required: true },
        downloads: { type: Number, default: 0, min: 0 },
        lastDownloadedAt: { type: Date, default: null },
    },
    { timestamps: true, versionKey: false, collection: "MockPapers" }
);

const MockPaper = mongoose.model<MockPaperDocument>("MockPaper", paperSchema);

export default MockPaper;
