import mongoose, { Schema, Document, Types } from "mongoose";

export const salaryModes = ["cash", "upi", "bank", "cheque"] as const;

/** One teacher's salary for one month. Net pay = basic + allowances + bonus − deductions. */
export interface SalaryDocument extends Document {
    salaryCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    teacher: Types.ObjectId;
    teacherCode: string;
    // Name when the salary was made, so old slips keep it even if the teacher is renamed or removed.
    teacherName: string;
    // "YYYY-MM"
    month: string;
    basic: number;
    allowances: number;
    bonus: number;
    deductions: number;
    netPay: number;
    status: "pending" | "paid";
    paidOn: Date | null;
    mode: (typeof salaryModes)[number] | null;
    reference: string | null;
    note: string | null;
}

const money = { type: Number, default: 0, min: 0 };

const salarySchema = new Schema<SalaryDocument>(
    {
        salaryCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        teacher: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
        teacherCode: { type: String, required: true },
        teacherName: { type: String, required: true, trim: true },
        month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
        basic: money,
        allowances: money,
        bonus: money,
        deductions: money,
        netPay: { type: Number, default: 0 },
        status: { type: String, enum: ["pending", "paid"], default: "pending" },
        paidOn: { type: Date, default: null },
        mode: { type: String, enum: [...salaryModes, null], default: null },
        reference: { type: String, default: null, trim: true },
        note: { type: String, default: null, trim: true },
    },
    { timestamps: true, versionKey: false, collection: "Salaries" }
);

// One salary per teacher per month.
salarySchema.index({ adminId: 1, teacher: 1, month: 1 }, { unique: true });

/** A teacher's regular monthly pay, used when the month's salaries are generated. */
export interface SalaryStructureDocument extends Document {
    adminId: Types.ObjectId;
    teacher: Types.ObjectId;
    teacherCode: string;
    basic: number;
    allowances: number;
    deductions: number;
    // How the teacher is usually paid, and where (account / UPI), shown when marking salaries paid.
    mode: (typeof salaryModes)[number];
    account: string | null;
}

const structureSchema = new Schema<SalaryStructureDocument>(
    {
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        teacher: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
        teacherCode: { type: String, required: true },
        basic: money,
        allowances: money,
        deductions: money,
        mode: { type: String, enum: salaryModes, default: "bank" },
        account: { type: String, default: null, trim: true },
    },
    { timestamps: true, versionKey: false, collection: "SalaryStructures" }
);
structureSchema.index({ adminId: 1, teacher: 1 }, { unique: true });

export const SalaryStructure = mongoose.model<SalaryStructureDocument>("SalaryStructure", structureSchema);

const Salary = mongoose.model<SalaryDocument>("Salary", salarySchema);

export default Salary;
