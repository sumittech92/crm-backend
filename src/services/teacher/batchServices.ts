
import mongoose from "mongoose";
import Batch from "../../model/teacher/batchModel.js"
interface CreateBatchInput {
    batchName: string;
    courseId: string;
    teacherId: string;
    startDate: string;
    endDate?: string | null;
    timing: string;
    days: string[];
    room?: string | null;
    studentCapacity?: number;
    status?: "active" | "inactive";
}

interface UpdateBatchInput {
    batchName?: string;
    courseId?: string;
    teacherId?: string;
    startDate?: string;
    endDate?: string | null;
    timing?: string;
    days?: string[];
    room?: string | null;
    studentCapacity?: number;
    status?: "active" | "inactive";
}

// CREATE BATCH
export const createBatch = async (data: CreateBatchInput) => {

    if (!data.batchName || !data.courseId || !data.teacherId) {
        throw new Error("Batch name, course and teacher are required");
    }

    if (
        !mongoose.Types.ObjectId.isValid(data.courseId) ||
        !mongoose.Types.ObjectId.isValid(data.teacherId)
    ) {
        throw new Error("Invalid course or teacher ID");
    }

    const startDate = new Date(data.startDate);

    if (isNaN(startDate.getTime())) {
        throw new Error("Invalid start date");
    }

    let endDate: Date | null = null;

    if (data.endDate) {
        endDate = new Date(data.endDate);

        if (isNaN(endDate.getTime())) {
            throw new Error("Invalid end date");
        }

        if (endDate < startDate) {
            throw new Error("End date cannot be before start date");
        }
    }

    const batch = await Batch.create({
        ...data,
        startDate,
        endDate
    });

    return batch;
};

// GET ALL BATCHES WITH PAGINATION AND SEARCH
export const getAllBatches = async (
    page: number,
    limit: number,
    search?: string
) => {
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (search?.trim()) {
        const searchValue = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        filter.batchName = {
            $regex: searchValue,
            $options: "i"
        };
    }

    const [batches, total] = await Promise.all([
        Batch.find(filter)
            .populate("courseId", "courseName subject")
            .populate("teacherId", "name fullName")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),

        Batch.countDocuments(filter)
    ]);

    return {
        batches,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    };
};

// GET BATCH BY ID
export const getBatchById = async (batchId: string) => {

    if (!mongoose.Types.ObjectId.isValid(batchId)) {
        throw new Error("Invalid batch ID");
    }

    const batch = await Batch.findById(batchId)
        .populate("courseId", "courseName subject")
        .populate("teacherId", "name fullName");

    if (!batch) {
        throw new Error("Batch not found");
    }

    return batch;
};

// UPDATE BATCH
export const updateBatch = async (
    batchId: string,
    data: UpdateBatchInput
) => {

    if (!mongoose.Types.ObjectId.isValid(batchId)) {
        throw new Error("Invalid batch ID");
    }

    if (data.courseId && !mongoose.Types.ObjectId.isValid(data.courseId)) {
        throw new Error("Invalid course ID");
    }

    if (data.teacherId && !mongoose.Types.ObjectId.isValid(data.teacherId)) {
        throw new Error("Invalid teacher ID");
    }

    if (data.startDate) {
        const startDate = new Date(data.startDate);

        if (isNaN(startDate.getTime())) {
            throw new Error("Invalid start date");
        }

        data.startDate = startDate.toISOString() as any;
    }

    if (data.endDate) {
        const endDate = new Date(data.endDate);

        if (isNaN(endDate.getTime())) {
            throw new Error("Invalid end date");
        }
    }

    const existingBatch = await Batch.findById(batchId);

    if (!existingBatch) {
        throw new Error("Batch not found");
    }

    const updatedData = {
        ...data,
        ...(data.startDate && { startDate: new Date(data.startDate) }),
        ...(data.endDate && { endDate: new Date(data.endDate) })
    };

    const finalStartDate = updatedData.startDate || existingBatch.startDate;
    const finalEndDate = updatedData.endDate !== undefined
        ? updatedData.endDate
        : existingBatch.endDate;

    if (finalEndDate && finalEndDate < finalStartDate) {
        throw new Error("End date cannot be before start date");
    }

    const batch = await Batch.findByIdAndUpdate(
        batchId,
        { $set: updatedData },
        {
            new: true,
            runValidators: true
        }
    )
        .populate("courseId", "courseName subject")
        .populate("teacherId", "name fullName");

    return batch;
};

// DELETE BATCH
export const deleteBatch = async (batchId: string) => {

    if (!mongoose.Types.ObjectId.isValid(batchId)) {
        throw new Error("Invalid batch ID");
    }

    const batch = await Batch.findByIdAndDelete(batchId);

    if (!batch) {
        throw new Error("Batch not found");
    }

    return batch;
};
