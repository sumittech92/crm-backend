import mongoose, { Types } from "mongoose";

export const enquiryStatuses = ["new", "contacted", "interested", "joined", "rejected"] as const;
export const enquirySources = ["website", "referral", "instagram", "walkIn", "phone"] as const;
/** Statuses that still need follow-up; a repeat website enquiry from the same number refreshes one of these. */
export const openEnquiryStatuses = ["new", "contacted", "interested"];

export interface AdmissionDocument extends mongoose.Document {
    enquiryCode: string;
    workType: "school" | "coaching";
    adminId: Types.ObjectId;
    studentName: string;
    parentName: string | null;
    countryCode: string;
    phoneNumber: string;
    email: string | null;
    className: string | null;
    previousSchool: string | null;
    message: string | null;
    source: (typeof enquirySources)[number];
    status: (typeof enquiryStatuses)[number];
    enquiryDate: Date;
    followUpDate: Date | null;
}

const admissionSchema = new mongoose.Schema<AdmissionDocument>(
    {
        enquiryCode: { type: String, required: true, match: /^\d{6}$/, unique: true },
        workType: { type: String, enum: ["school", "coaching"], required: true },
        // The owner (institute / school) the enquiry was made to.
        adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
        studentName: { type: String, required: true, trim: true },
        parentName: { type: String, default: null, trim: true },
        countryCode: { type: String, required: true, trim: true },
        phoneNumber: { type: String, required: true, trim: true },
        email: { type: String, default: null, trim: true, lowercase: true },
        // Coaching: course / class; school: class applying for.
        className: { type: String, default: null, trim: true },
        previousSchool: { type: String, default: null, trim: true },
        message: { type: String, default: null, trim: true },
        source: { type: String, enum: enquirySources, default: "website" },
        status: { type: String, enum: enquiryStatuses, default: "new" },
        enquiryDate: { type: Date, default: () => new Date() },
        followUpDate: { type: Date, default: null },
    },
    { timestamps: true, versionKey: false, collection: "Admissions" },
);

admissionSchema.index({ adminId: 1, countryCode: 1, phoneNumber: 1, status: 1 });

const Admission = mongoose.model<AdmissionDocument>("Admission", admissionSchema);
export default Admission;
