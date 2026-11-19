import mongoose, { Schema, Document, Types } from "mongoose";

/** Super Admin view of an institute: address and brand set up when the workspace was created. One per owner account. */
export interface WorkspaceDocument extends Document {
    adminId: Types.ObjectId;
    address: string | null;
    brandColor: string;
    secondaryColor: string;
    // Small data URL (the panel scales logos to 256 px).
    logo: string | null;
}

const workspaceSchema = new Schema<WorkspaceDocument>(
    {
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, unique: true },
        address: { type: String, default: null, trim: true },
        brandColor: { type: String, default: "#4871e1", match: /^#[0-9a-fA-F]{6}$/ },
        secondaryColor: { type: String, default: "#f5a524", match: /^#[0-9a-fA-F]{6}$/ },
        logo: { type: String, default: null },
    },
    { timestamps: true, versionKey: false, collection: "Workspaces" }
);

export interface SubscriptionPayment { _id?: Types.ObjectId; paidOn: Date; amount: number; months: number; reference: string | null; }

/** An institute's EduNexa plan. Each renewal records a payment and moves the renewal date forward. */
export interface SubscriptionDocument extends Document {
    subscriptionCode: string;
    adminId: Types.ObjectId;
    plan: string;
    // Monthly rent in rupees.
    amount: number;
    startDate: Date;
    renewalDate: Date;
    cancelled: boolean;
    note: string | null;
    payments: SubscriptionPayment[];
}

const paymentSchema = new Schema<SubscriptionPayment>(
    {
        paidOn: { type: Date, required: true },
        amount: { type: Number, required: true, min: 0 },
        months: { type: Number, required: true, min: 1 },
        reference: { type: String, default: null, trim: true },
    },
    { _id: true }
);

const subscriptionSchema = new Schema<SubscriptionDocument>(
    {
        subscriptionCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        // One plan per institute.
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, unique: true },
        plan: { type: String, required: true, trim: true },
        amount: { type: Number, required: true, min: 0 },
        startDate: { type: Date, required: true },
        renewalDate: { type: Date, required: true },
        cancelled: { type: Boolean, default: false },
        note: { type: String, default: null, trim: true },
        payments: { type: [paymentSchema], default: [] },
    },
    { timestamps: true, versionKey: false, collection: "Subscriptions" }
);

export interface PlanOption { name: string; amount: number; description: string | null; }

/** Platform-wide settings (single document). */
export interface PlatformSettingsDocument extends Document {
    key: "platform";
    plans: PlanOption[];
    supportPhone: string | null;
    supportEmail: string | null;
    // Renewals this many days away show as "Due soon".
    reminderDays: number;
}

const settingsSchema = new Schema<PlatformSettingsDocument>(
    {
        key: { type: String, enum: ["platform"], default: "platform", unique: true },
        plans: {
            type: [new Schema<PlanOption>({ name: { type: String, required: true, trim: true }, amount: { type: Number, required: true, min: 0 }, description: { type: String, default: null, trim: true } }, { _id: false })],
            default: [
                { name: "Starter", amount: 999, description: "Up to 150 students" },
                { name: "Growth", amount: 1999, description: "Up to 500 students" },
                { name: "Academy", amount: 2499, description: "Unlimited students, every module" },
            ],
        },
        supportPhone: { type: String, default: null, trim: true },
        supportEmail: { type: String, default: null, trim: true, lowercase: true },
        reminderDays: { type: Number, default: 7, min: 1, max: 60 },
    },
    { timestamps: true, versionKey: false, collection: "PlatformSettings" }
);

export const Workspace = mongoose.model<WorkspaceDocument>("Workspace", workspaceSchema);
export const Subscription = mongoose.model<SubscriptionDocument>("Subscription", subscriptionSchema);
export const PlatformSettings = mongoose.model<PlatformSettingsDocument>("PlatformSettings", settingsSchema);
