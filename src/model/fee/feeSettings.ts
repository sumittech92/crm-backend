import mongoose, { Schema, Document, Types } from "mongoose";

/** Where students and parents send fees: shown in the portal's "Pay fees" form. One per institute. */
export interface FeeSettingsDocument extends Document {
    adminId: Types.ObjectId;
    upiId: string | null;
    accountName: string | null;
    accountNumber: string | null;
    ifsc: string | null;
    bankName: string | null;
    note: string | null;
}

const feeSettingsSchema = new Schema<FeeSettingsDocument>(
    {
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, unique: true },
        upiId: { type: String, default: null, trim: true },
        accountName: { type: String, default: null, trim: true },
        accountNumber: { type: String, default: null, trim: true },
        ifsc: { type: String, default: null, trim: true, uppercase: true },
        bankName: { type: String, default: null, trim: true },
        note: { type: String, default: null, trim: true },
    },
    { timestamps: true, versionKey: false, collection: "FeeSettings" }
);

const FeeSettings = mongoose.model<FeeSettingsDocument>("FeeSettings", feeSettingsSchema);

export default FeeSettings;
