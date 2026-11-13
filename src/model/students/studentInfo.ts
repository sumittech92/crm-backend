
import mongoose from "mongoose";

export interface StudentDocument extends mongoose.Document {
    studentCode: string;
    workType: "school" | "coaching";
    studentId: mongoose.Types.ObjectId;
    adminId: mongoose.Types.ObjectId | null;
    fullName: string | null;
    profileImage: string | null;
    gender: "male" | "female" | null;
    dateOfBirth: Date | null;
    status: "active" | "inactive";
    // The student's agreed fee (coaching: per month, school: per term) and discount / concession. Fees are still collected per period in the Fees module.
    feePlan: { amount: number | null; discount: number };
    // Parent login (Auth, role "parent") the owner gave this student's parent; siblings with the same parent mobile share it.
    parentId: mongoose.Types.ObjectId | null;

    parentsInfo: {
        fatherName: string | null;
        motherName: string | null;
        countryCode: string | null;
        phoneNumber: string | null;
    };

    address: {
        addressLine: string | null;
        city: string | null;
        state: string | null;
        pincode: string | null;
    };

    schoolInfo: {
        schoolName: string | null;
        board: string | null;
        className: string | null;
        section: string | null;
        admissionDate: Date | null;
        rollNumber: string | null;
        currentTerm: string | null;
        admissionCategory: string | null;
        // Optional (elective) subjects of the class the student takes; chosen by the student or class teacher.
        optionalSubjects: string[];
    };

    coachingInfo: {
        coachingName: string | null;
        className: string | null;
        course: string | null;
        batchTiming: string | null;
        admissionDate: Date | null;
        schoolName: string | null;
        board: string | null;
    };
}

const studentDetailsSchema = new mongoose.Schema<StudentDocument>(
    {
        workType: {
            type: String,
            enum: ["school", "coaching"],
            required: true,
        },
        studentCode: {
            type: String,
            required: true,
            match: /^\d{6}$/,
            unique: true,
        },
        studentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Auth",
            required: true,
        },
        // Owner (admin) who created this student; owners only see their own students.
        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Auth",
            default: null,
            index: true,
        },

        fullName: {
            type: String,
            default: null,
            trim: true,
        },

        profileImage: {
            type: String,
            default: null,
        },

        gender: {
            type: String,
            enum: ["male", "female", "other"],
            default: null,
        },

        dateOfBirth: {
            type: Date,
            default: null,
        },
        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active",
        },
        feePlan: {
            amount: { type: Number, default: null, min: 0 },
            discount: { type: Number, default: 0, min: 0 },
        },
        parentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Auth",
            default: null,
            index: true,
        },
        // Parents information
        parentsInfo: {
            fatherName: { type: String, default: null },
            motherName: { type: String, default: null },
            countryCode: { type: String, default: null },
            phoneNumber: { type: String, default: null },
        },

        // Address information
        address: {
            addressLine: { type: String, default: null },
            city: { type: String, default: null },
            state: { type: String, default: null },
            pincode: { type: String, default: null },
        },

        // School academic information
        schoolInfo: {
            schoolName: { type: String, default: null },
            board: { type: String, default: null },
            className: { type: String, default: null },
            section: { type: String, default: null },
            admissionDate: { type: Date, default: null },
            rollNumber: { type: String, default: null },
            currentTerm: { type: String, default: null },
            admissionCategory: { type: String, default: null },
            optionalSubjects: { type: [String], default: [] },
        },

        // Coaching academic information
        coachingInfo: {
            coachingName: { type: String, default: null },
            className: { type: String, default: null },
            course: { type: String, default: null },
            batchTiming: { type: String, default: null },
            admissionDate: { type: Date, default: null },
            schoolName: { type: String, default: null },
            board: { type: String, default: null },
        },
    },
    {
        strict: true,
        collection: "StudentDetails",
        versionKey: false,
        timestamps: true,
    }
);

const StudentDetailsModel = mongoose.model<StudentDocument>( "StudentDetails", studentDetailsSchema );

export default StudentDetailsModel;
