import mongoose, { Schema, Document, Types } from "mongoose";

export const submissionModes = ["UPI", "Card", "Net banking", "Bank Transfer", "Cash at office"] as const;
export const submissionStatuses = ["pending", "approved", "rejected"] as const;

/**
 * A fee payment a student or parent reports from the portal. The office checks it on the Fees page:
 * approving records the payment (and receipt) on the student's fee for that period, rejecting keeps it unpaid.
 */
export interface FeeSubmissionDocument extends Document {
    adminId: Types.ObjectId;
    workType: "school" | "coaching";
    student: Types.ObjectId;
    period: string;
    amount: number;
    mode: (typeof submissionModes)[number];
    reference: string | null;
    // Screenshot / receipt uploaded through /upload/portal.
    proof: { url: string; name: string } | null;
    note: string | null;
    submittedBy: Types.ObjectId;
    submittedByName: string | null;
    status: (typeof submissionStatuses)[number];
    reviewNote: string | null;
    reviewedBy: Types.ObjectId | null;
    reviewedAt: Date | null;
    receiptNo: string | null;
}

const feeSubmissionSchema = new Schema<FeeSubmissionDocument>(
    {
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        student: { type: Schema.Types.ObjectId, ref: "StudentDetails", required: true, index: true },
        period: { type: String, required: true, trim: true },
        amount: { type: Number, required: true, min: 1 },
        mode: { type: String, enum: submissionModes, required: true },
        reference: { type: String, default: null, trim: true },
        proof: { type: new Schema({ url: { type: String, required: true }, name: { type: String, required: true } }, { _id: false }), default: null },
        note: { type: String, default: null, trim: true },
        submittedBy: { type: Schema.Types.ObjectId, ref: "Auth", required: true },
        submittedByName: { type: String, default: null },
        status: { type: String, enum: submissionStatuses, default: "pending" },
        reviewNote: { type: String, default: null, trim: true },
        reviewedBy: { type: Schema.Types.ObjectId, ref: "Auth", default: null },
        reviewedAt: { type: Date, default: null },
        receiptNo: { type: String, default: null },
    },
    { timestamps: true, versionKey: false, collection: "FeeSubmissions" }
);

const FeeSubmission = mongoose.model<FeeSubmissionDocument>("FeeSubmission", feeSubmissionSchema);

export default FeeSubmission;
