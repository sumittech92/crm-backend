import mongoose, { Schema, Document, Types } from "mongoose";

/** How often the course / class fee is charged. Coaching uses monthly, quarterly or oneTime; schools use perTerm, monthly or annual. */
export const feeFrequencies = ["monthly", "quarterly", "perTerm", "annual", "oneTime"] as const;
export const coachingFeeFrequencies = ["monthly", "quarterly", "oneTime"];
export const schoolFeeFrequencies = ["perTerm", "monthly", "annual"];
export const courseStatuses = ["active", "inactive"] as const;

/**
 * A coaching course (e.g. "Class 12 Science", "JEE Preparation") or a school class (e.g. "Class 9").
 * `name` is what students store as their course / class, so enrolment is matched by name.
 */
export interface CourseDocument extends Document {
    courseCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    name: string;
    description: string | null;
    // Coaching: course length ("12 months"); school: session ("April – March").
    duration: string | null;
    feeAmount: number;
    feeFrequency: (typeof feeFrequencies)[number];
    subjects: string[];
    status: (typeof courseStatuses)[number];
}

const courseSchema = new Schema<CourseDocument>(
    {
        courseCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        // The owner (institute / school) the course belongs to.
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        name: { type: String, required: true, trim: true },
        description: { type: String, default: null, trim: true },
        duration: { type: String, default: null, trim: true },
        feeAmount: { type: Number, required: true, min: 0 },
        feeFrequency: { type: String, enum: feeFrequencies, required: true },
        subjects: { type: [String], default: [] },
        status: { type: String, enum: courseStatuses, default: "active" },
    },
    { timestamps: true, versionKey: false, collection: "Courses" }
);

// One course / class per name in each institute.
courseSchema.index({ adminId: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

const Course = mongoose.model<CourseDocument>("Course", courseSchema);

export default Course;
