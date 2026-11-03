
import mongoose from "mongoose";

export interface StudentDocument extends mongoose.Document {
    studentCode: string;
    workType: "school" | "coaching";
    studentId: mongoose.Types.ObjectId;
    fullName: string | null;
    profileImage: string | null;
    gender: "male" | "female" | null;

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
