import mongoose, { Schema, Document, Types } from "mongoose";

/** Per-institute library rules set by the owner. */
export interface LibrarySettingsDocument extends Document {
    adminId: Types.ObjectId;
    loanDays: number;
    finePerDay: number;
    maxBooks: number;
}

/**
 * A title in the catalogue. Coaching counts copies; schools give every copy an accession number
 * (then `copies` equals the number of accession numbers).
 */
export interface BookDocument extends Document {
    bookCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    title: string;
    author: string;
    isbn: string | null;
    category: string;
    shelf: string | null;
    copies: number;
    accessionNumbers: string[];
}

/** A copy lent to a student or teacher. `fine` is charged at return (0 when waived). */
export interface LoanDocument extends Document {
    loanCode: string;
    adminId: Types.ObjectId;
    bookId: Types.ObjectId;
    accessionNo: string | null;
    memberType: "student" | "teacher";
    // StudentDetails or Teacher document.
    memberId: Types.ObjectId;
    memberCode: string;
    memberName: string;
    issuedOn: Date;
    dueOn: Date;
    returnedOn: Date | null;
    fine: number;
    fineWaived: boolean;
    renewals: number;
    issuedBy: Types.ObjectId;
}

/** A student's request for a book from the Student portal. */
export interface BookRequestDocument extends Document {
    requestCode: string;
    adminId: Types.ObjectId;
    bookId: Types.ObjectId;
    studentId: Types.ObjectId;
    studentCode: string;
    studentName: string;
    status: "requested" | "issued" | "declined";
}

const settingsSchema = new Schema<LibrarySettingsDocument>(
    {
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, unique: true },
        loanDays: { type: Number, default: 14, min: 1, max: 365 },
        finePerDay: { type: Number, default: 2, min: 0, max: 1000 },
        maxBooks: { type: Number, default: 3, min: 1, max: 50 },
    },
    { timestamps: true, versionKey: false, collection: "LibrarySettings" }
);

const bookSchema = new Schema<BookDocument>(
    {
        bookCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        title: { type: String, required: true, trim: true },
        author: { type: String, required: true, trim: true },
        isbn: { type: String, default: null, trim: true },
        category: { type: String, required: true, trim: true },
        shelf: { type: String, default: null, trim: true },
        copies: { type: Number, required: true, min: 1 },
        accessionNumbers: { type: [String], default: [] },
    },
    { timestamps: true, versionKey: false, collection: "LibraryBooks" }
);
// An accession number belongs to one copy in the institute.
bookSchema.index({ adminId: 1, accessionNumbers: 1 });

const loanSchema = new Schema<LoanDocument>(
    {
        loanCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        bookId: { type: Schema.Types.ObjectId, ref: "LibraryBook", required: true, index: true },
        accessionNo: { type: String, default: null },
        memberType: { type: String, enum: ["student", "teacher"], required: true },
        memberId: { type: Schema.Types.ObjectId, required: true, index: true },
        memberCode: { type: String, required: true },
        memberName: { type: String, required: true },
        issuedOn: { type: Date, required: true },
        dueOn: { type: Date, required: true },
        returnedOn: { type: Date, default: null },
        fine: { type: Number, default: 0 },
        fineWaived: { type: Boolean, default: false },
        renewals: { type: Number, default: 0 },
        issuedBy: { type: Schema.Types.ObjectId, ref: "Auth", required: true },
    },
    { timestamps: true, versionKey: false, collection: "LibraryLoans" }
);

const requestSchema = new Schema<BookRequestDocument>(
    {
        requestCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        adminId: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        bookId: { type: Schema.Types.ObjectId, ref: "LibraryBook", required: true },
        studentId: { type: Schema.Types.ObjectId, ref: "StudentDetails", required: true },
        studentCode: { type: String, required: true },
        studentName: { type: String, required: true },
        status: { type: String, enum: ["requested", "issued", "declined"], default: "requested" },
    },
    { timestamps: true, versionKey: false, collection: "LibraryRequests" }
);

export const LibrarySettings = mongoose.model<LibrarySettingsDocument>("LibrarySettings", settingsSchema);
export const LibraryBook = mongoose.model<BookDocument>("LibraryBook", bookSchema);
export const LibraryLoan = mongoose.model<LoanDocument>("LibraryLoan", loanSchema);
export const BookRequest = mongoose.model<BookRequestDocument>("BookRequest", requestSchema);
