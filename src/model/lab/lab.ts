import mongoose, { Schema, Document, Types } from "mongoose";

export const labTypes = ["science", "physics", "chemistry", "biology", "computer", "language", "other"] as const;
export const equipmentConditions = ["working", "damaged", "underRepair"] as const;

/** A lab of the institute (science, computer…), with a room, an in-charge teacher and capacity. */
export interface LabDocument extends Document {
    labCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    name: string;
    type: (typeof labTypes)[number];
    room: string | null;
    // In-charge teacher (6-digit teacher code) and their name when assigned.
    inChargeCode: string | null;
    inChargeName: string | null;
    capacity: number | null;
    description: string | null;
    status: "active" | "inactive";
}

/** One equipment item in a lab (microscope, computer…), with how many there are and their condition. */
export interface LabEquipmentDocument extends Document {
    equipmentCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    lab: Types.ObjectId;
    name: string;
    quantity: number;
    condition: (typeof equipmentConditions)[number];
    purchaseDate: Date | null;
    note: string | null;
    status: "active" | "inactive";
}

const scoped = {
    workType: { type: String, enum: ["school", "coaching"], required: true },
    adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
};

const labSchema = new Schema<LabDocument>(
    {
        labCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        ...scoped,
        name: { type: String, required: true, trim: true },
        type: { type: String, enum: labTypes, default: "science" },
        room: { type: String, default: null, trim: true },
        inChargeCode: { type: String, default: null },
        inChargeName: { type: String, default: null, trim: true },
        capacity: { type: Number, default: null, min: 1 },
        description: { type: String, default: null, trim: true },
        status: { type: String, enum: ["active", "inactive"], default: "active" },
    },
    { timestamps: true, versionKey: false, collection: "Labs" }
);

const equipmentSchema = new Schema<LabEquipmentDocument>(
    {
        equipmentCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        ...scoped,
        lab: { type: Schema.Types.ObjectId, ref: "Lab", required: true, index: true },
        name: { type: String, required: true, trim: true },
        quantity: { type: Number, required: true, min: 0 },
        condition: { type: String, enum: equipmentConditions, default: "working" },
        purchaseDate: { type: Date, default: null },
        note: { type: String, default: null, trim: true },
        status: { type: String, enum: ["active", "inactive"], default: "active" },
    },
    { timestamps: true, versionKey: false, collection: "LabEquipment" }
);

export const Lab = mongoose.model<LabDocument>("Lab", labSchema);
export const LabEquipment = mongoose.model<LabEquipmentDocument>("LabEquipment", equipmentSchema);
