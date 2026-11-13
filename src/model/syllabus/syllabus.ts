import mongoose, { Schema, Document, Types } from "mongoose";

/** One chapter of a syllabus. `targetMonth` (YYYY-MM) drives On track / Behind; `weight` (planned periods) weights the %. */
export interface SyllabusChapter {
    _id: Types.ObjectId;
    title: string;
    targetMonth: string | null;
    weight: number;
    // Auth user who added it (teachers may add chapters to subjects they teach and edit only those).
    addedBy: Types.ObjectId | null;
}

/**
 * The chapter list of one subject of a school class ("Class 9 · Mathematics") or a coaching course
 * ("Navodaya Entrance · Mental Ability"). Every section / batch of the class / course shares it; each tracks its own progress.
 */
export interface SyllabusDocument extends Document {
    syllabusCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    courseId: Types.ObjectId;
    subject: string;
    chapters: Types.DocumentArray<SyllabusChapter & Document>;
}

const chapterSchema = new Schema<SyllabusChapter>(
    {
        title: { type: String, required: true, trim: true },
        targetMonth: { type: String, default: null, match: /^\d{4}-\d{2}$/ },
        weight: { type: Number, default: 1, min: 1, max: 100 },
        addedBy: { type: Schema.Types.ObjectId, ref: "Auth", default: null },
    },
    { _id: true }
);

const syllabusSchema = new Schema<SyllabusDocument>(
    {
        syllabusCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
        subject: { type: String, required: true, trim: true },
        chapters: { type: [chapterSchema], default: [] },
    },
    { timestamps: true, versionKey: false, collection: "Syllabi" }
);

// One syllabus per subject of a class / course.
syllabusSchema.index({ adminId: 1, courseId: 1, subject: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

/** A chapter a section / batch has finished. */
export interface SyllabusProgressDocument extends Document {
    adminId: Types.ObjectId;
    syllabusId: Types.ObjectId;
    batchId: Types.ObjectId;
    chapterId: Types.ObjectId;
    completedOn: Date;
    markedBy: Types.ObjectId;
}

const progressSchema = new Schema<SyllabusProgressDocument>(
    {
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        syllabusId: { type: Schema.Types.ObjectId, ref: "Syllabus", required: true },
        batchId: { type: Schema.Types.ObjectId, ref: "Batch", required: true, index: true },
        chapterId: { type: Schema.Types.ObjectId, required: true },
        completedOn: { type: Date, required: true },
        markedBy: { type: Schema.Types.ObjectId, ref: "Auth", required: true },
    },
    { timestamps: true, versionKey: false, collection: "SyllabusProgress" }
);

progressSchema.index({ syllabusId: 1, batchId: 1, chapterId: 1 }, { unique: true });

export const SyllabusProgress = mongoose.model<SyllabusProgressDocument>("SyllabusProgress", progressSchema);
const Syllabus = mongoose.model<SyllabusDocument>("Syllabus", syllabusSchema);
export default Syllabus;
