import mongoose, { Schema, Types } from "mongoose";

export interface TeacherDocument extends mongoose.Document {
    teacherCode: string;
    workType: "school" | "coaching";
    teacherId: Types.ObjectId;
    fullName: string | null;
    email: string | null;
    countryCode: string | null;
    phoneNumber: string | null;
    joiningDate: Date | null;
    status: "active" | "inactive" | "pending";
    profileImage: string | null;
    gender: "male" | "female" | null;

    schoolInfo?: {
        employeeId: string | null;
        designation: string | null;
        department: string | null;
        qualification: string[];
        subjects: string[];
        classesTaught: string[];
    };

    coachingInfo?: {
        qualification: string[];
        experience: number | null;
        subjects: string[];
        classesTaught: string[];
    };
}

const teacherSchema = new Schema<TeacherDocument>(
    {
        workType: {
            type: String,
            enum: ["school", "coaching"],
            required: true,
        },
        teacherCode: {
            type: String,
            required: true,
            match: /^\d{6}$/,
            unique: true,
        },
        teacherId: {
            type: Schema.Types.ObjectId,
            ref: "Auth",
            required: true,
        },

        fullName: {
            type: String,
            trim: true,
            default: null,
        },

        email: {
            type: String,
            trim: true,
            lowercase: true,
            default: null,
        },

        countryCode: {
            type: String,
            trim: true,
            default: null,
        },

        phoneNumber: {
            type: String,
            trim: true,
            default: null,
        },

        joiningDate: {
            type: Date,
            default: null,
        },

        status: {
            type: String,
            enum: ["active", "inactive", "pending"],
            default: "pending",
        },

        profileImage: {
            type: String,
            default: null,
        },

        gender: {
            type: String,
            enum: ["male", "female", null],
            default: null,
        },

        schoolInfo: {
            employeeId: {
                type: String,
                trim: true,
                default: null,
            },

            designation: {
                type: String,
                trim: true,
                default: null,
            },

            department: {
                type: String,
                trim: true,
                default: null,
            },

            qualification: {
                type: [String],
                default: [],
            },

            subjects: {
                type: [String],
                default: [],
            },

            classesTaught: {
                type: [String],
                default: [],
            },
        },

        coachingInfo: {
            qualification: {
                type: [String],
                default: [],
            },

            experience: {
                type: Number,
                min: 0,
                default: null,
            },

            subjects: {
                type: [String],
                default: [],
            },

            classesTaught: {
                type: [String],
                default: [],
            },
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

const Teacher = mongoose.model<TeacherDocument>( "Teacher", teacherSchema );

export default Teacher;
