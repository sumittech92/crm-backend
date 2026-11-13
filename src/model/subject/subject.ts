import mongoose, { Schema, Document, Types } from "mongoose";

export const subjectStatuses = ["active", "inactive"] as const;

/** Who teaches the subject in one section of the class. `teacherId` is null until a teacher is assigned. */
export interface SubjectSection {
    batchId: Types.ObjectId;
    teacherId: Types.ObjectId | null;
}

/**
 * A subject taught in a school class ("Mathematics" in "Class 9"), with a teacher for each section.
 * The subject name is also kept in the class's `subjects` list and the teachers' `schoolInfo.subjects`,
 * which exams and marks entry read.
 */
export interface SubjectDocument extends Document {
    subjectCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    courseId: Types.ObjectId;
    name: string;
    // Short code shown on timetables, e.g. "MATH-09".
    code: string | null;
    periodsPerWeek: number | null;
    sections: SubjectSection[];
    status: (typeof subjectStatuses)[number];
}

const sectionSchema = new Schema<SubjectSection>(
    {
        batchId: { type: Schema.Types.ObjectId, ref: "Batch", required: true },
        teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", default: null },
    },
    { _id: false }
);

const subjectSchema = new Schema<SubjectDocument>(
    {
        subjectCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
        name: { type: String, required: true, trim: true },
        code: { type: String, default: null, trim: true },
        periodsPerWeek: { type: Number, default: null, min: 1, max: 60 },
        sections: { type: [sectionSchema], default: [] },
        status: { type: String, enum: subjectStatuses, default: "active" },
    },
    { timestamps: true, versionKey: false, collection: "Subjects" }
);

// One subject per name in each class.
subjectSchema.index({ adminId: 1, courseId: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
subjectSchema.index({ "sections.batchId": 1 });
subjectSchema.index({ "sections.teacherId": 1 });

const Subject = mongoose.model<SubjectDocument>("Subject", subjectSchema);

export default Subject;
