import mongoose, { Schema, Types } from "mongoose";

export const paymentModes = ["Cash", "UPI", "Card", "Bank Transfer", "Cheque", "Net banking"] as const;

export interface FeePayment {
    _id?: Types.ObjectId;
    receiptNo: string;
    amount: number;
    discount: number;
    mode: (typeof paymentModes)[number];
    paidOn: Date;
    reference: string | null;
    note: string | null;
    collectedBy: Types.ObjectId | null;
}

export interface FeeDocument extends mongoose.Document {
    adminId: Types.ObjectId | null;
    workType: "school" | "coaching";
    student: Types.ObjectId;
    period: string;
    totalFee: number;
    discount: number;
    paidAmount: number;
    dueDate: Date | null;
    note: string | null;
    payments: FeePayment[];
}

const paymentSchema = new Schema<FeePayment>(
    {
        receiptNo: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        discount: { type: Number, default: 0, min: 0 },
        mode: { type: String, enum: paymentModes, required: true },
        paidOn: { type: Date, required: true },
        reference: { type: String, default: null, trim: true },
        note: { type: String, default: null, trim: true },
        collectedBy: { type: Schema.Types.ObjectId, ref: "Auth", default: null },
    },
    { timestamps: true, versionKey: false }
);

const feeSchema = new Schema<FeeDocument>(
    {
        // Owner (admin) the student belongs to; owners only see their own fees.
        adminId: {
            type: Schema.Types.ObjectId,
            ref: "Auth",
            default: null,
            index: true,
        },
        workType: {
            type: String,
            enum: ["school", "coaching"],
            required: true,
        },
        student: {
            type: Schema.Types.ObjectId,
            ref: "StudentDetails",
            required: true,
        },
        // "September 2026" for coaching, "Term 1 · 2026–27" for schools.
        period: {
            type: String,
            required: true,
            trim: true,
        },
        totalFee: {
            type: Number,
            required: true,
            min: 0,
        },
        // Discount (coaching) / concession (school), including discounts given with payments.
        discount: {
            type: Number,
            default: 0,
            min: 0,
        },
        paidAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        // After this day an unpaid balance shows as Overdue.
        dueDate: {
            type: Date,
            default: null,
        },
        note: {
            type: String,
            default: null,
            trim: true,
        },
        payments: {
            type: [paymentSchema],
            default: [],
        },
    },
    {
        strict: true,
        collection: "Fees",
        versionKey: false,
        timestamps: true,
    }
);

// One fee per student per month / term.
feeSchema.index({ student: 1, period: 1 }, { unique: true });

const FeeModel = mongoose.model<FeeDocument>("Fee", feeSchema);

export default FeeModel;
