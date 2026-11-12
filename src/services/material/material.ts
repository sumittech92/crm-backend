import HttpStatus from "http-status-codes";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import Material from "../../model/material/material.js";
import Course from "../../model/teacher/courseModel.js";
import Batch from "../../model/teacher/batchModel.js";
import { generateSixDigitId } from "../../utilis/generateId.js";
import { StaffActor, actorScope, isOwnerLike, teacherBatchIds, teachesSubject } from "../../utilis/staffAccess.js";

const statusError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const blankToNull = (value: unknown) => typeof value === "string" && !value.trim() ? null : value;
const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");
const codeOrId = (value: string, codeField: string) => {
  const text = String(value ?? "").trim();
  if (/^\d{6}$/.test(text)) return { [codeField]: text };
  if (mongoose.Types.ObjectId.isValid(text)) return { _id: text };
  return null;
};

/** Removes a file this server stored under uploads/materials (links and other URLs are left alone). */
const removeStoredFile = (url?: string | null) => {
  const relative = String(url || "").split("/uploads/")[1];
  if (!relative?.startsWith("materials/")) return;
  const file = path.resolve(UPLOAD_ROOT, relative);
  if (file.startsWith(path.join(UPLOAD_ROOT, "materials") + path.sep)) fs.unlink(file, () => {});
};

export class MaterialService {

  /**
   * Owners manage all materials. A teacher manages materials for batches / sections they teach;
   * in schools also materials of their own subject.
   */
  private static canManage(material: Record<string, any>, actor: StaffActor, myBatches: string[]) {
    if (isOwnerLike(actor)) return true;
    if (actor.role !== "teacher") return false;
    if (material.batchIds?.length && material.batchIds.every(id => myBatches.includes(String(id)))) return true;
    return material.workType === "school" && teachesSubject(actor, material.subject);
  }

  /** Teachers also see course-wide materials of courses they teach a batch of. */
  private static canView(material: Record<string, any>, actor: StaffActor, myBatches: string[], myCourses: string[]) {
    if (this.canManage(material, actor, myBatches)) return true;
    if (material.batchIds?.some(id => myBatches.includes(String(id)))) return true;
    return !material.batchIds?.length && myCourses.includes(String(material.courseId));
  }

  private static async teacherCourses(myBatches: string[]) {
    if (!myBatches.length) return [];
    return (await Batch.find({ _id: { $in: myBatches } }).select("courseId").lean()).map(batch => String(batch.courseId));
  }

  private static async prepare(input: Record<string, any>, actor: StaffActor, current?: Record<string, any>) {
    const workType = current?.workType ?? actor.workType;
    const adminId = current?.adminId ?? actor.adminId;
    const data: Record<string, any> = {};
    for (const field of ["title", "description", "subject", "type", "status"]) if (input[field] !== undefined) data[field] = blankToNull(input[field]);

    if (input.courseCode !== undefined) {
      const match = codeOrId(input.courseCode, "courseCode");
      const course = match ? await Course.findOne({ ...match, adminId, workType }).select("_id").lean() : null;
      if (!course) throw statusError(workType === "school" ? "Class not found" : "Course not found", HttpStatus.BAD_REQUEST);
      data.courseId = course._id;
    }
    if (input.batchCodes !== undefined) {
      const matches = input.batchCodes.map(code => codeOrId(code, "batchCode"));
      if (matches.some(match => !match)) throw statusError("Invalid batch ID", HttpStatus.BAD_REQUEST);
      const batches = matches.length ? await Batch.find({ adminId, $or: matches }).select("_id courseId").lean() : [];
      if (batches.length !== new Set(input.batchCodes).size) throw statusError(workType === "school" ? "Section not found" : "Batch not found", HttpStatus.BAD_REQUEST);
      if (workType === "coaching" && batches.length > 1) throw statusError("Choose one batch, or none for the whole course", HttpStatus.BAD_REQUEST);
      data.batchIds = batches.map(batch => batch._id);
      data.batchCourseIds = batches.map(batch => String(batch.courseId));
    }

    const next = { ...current, ...data };
    if (data.batchCourseIds?.some(id => id !== String(next.courseId))) throw statusError(workType === "school" ? "Sections must belong to the chosen class" : "The batch must belong to the chosen course", HttpStatus.BAD_REQUEST);
    delete data.batchCourseIds;

    // A material is either an uploaded file or a link; videos are links only.
    if (input.file !== undefined) {
      if (input.file && !String(input.file.url).includes(`/uploads/materials/${adminId}/`)) throw statusError("Upload the file again", HttpStatus.BAD_REQUEST);
      data.file = input.file || null;
    }
    if (input.link !== undefined) data.link = blankToNull(input.link);
    const merged = { ...current, ...data };
    if (merged.type === "video") {
      if (!merged.link) throw statusError("Add the video link (YouTube, Google Drive, Vimeo…)", HttpStatus.BAD_REQUEST);
      data.file = null;
    } else if (!merged.file && !merged.link) {
      throw statusError("Upload a file or add a link", HttpStatus.BAD_REQUEST);
    } else if (data.file) {
      data.link = null;
    } else if (data.link) {
      data.file = null;
    }
    if (data.status !== undefined && data.status !== current?.status) data.publishedAt = data.status === "published" ? new Date() : null;
    return data;
  }

  static async createMaterial(input: Record<string, any>, actor: StaffActor) {
    if (!actor.adminId || !actor.workType) throw statusError("Only an Owner or teacher can add materials", HttpStatus.FORBIDDEN);
    const data = { adminId: actor.adminId, workType: actor.workType, createdBy: actor.userId, status: "published", ...await this.prepare(input, actor) };
    if (data.status === "published") data.publishedAt ??= new Date();
    const myBatches = await teacherBatchIds(actor);
    if (!this.canManage(data, actor, myBatches)) throw statusError("You can add materials only for batches / sections you teach", HttpStatus.FORBIDDEN);
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const material = await Material.create({ ...data, materialCode: generateSixDigitId() });
        return (await this.present([material.toObject()], actor, myBatches))[0];
      } catch (error) {
        if (!(error.code === 11000 && error.keyPattern?.materialCode) || attempt === 9) throw error;
      }
    }
    throw new Error("Unable to generate a unique material ID");
  }

  private static async findMaterial(identifier: string, actor: StaffActor) {
    const match = codeOrId(identifier, "materialCode");
    if (!match) throw statusError("Invalid material ID", HttpStatus.BAD_REQUEST);
    const material = await Material.findOne({ ...match, ...actorScope(actor) }).lean();
    const myBatches = await teacherBatchIds(actor);
    if (!material || !this.canView(material, actor, myBatches, await this.teacherCourses(myBatches))) throw statusError("Material not found", HttpStatus.NOT_FOUND);
    return { material, myBatches };
  }

  static async getAllMaterials(actor: StaffActor, { status }: { status?: string } = {}) {
    const myBatches = await teacherBatchIds(actor);
    const myCourses = await this.teacherCourses(myBatches);
    const materials = (await Material.find({ ...actorScope(actor), ...(status ? { status } : {}) }).sort({ createdAt: -1 }).lean())
      .filter(material => this.canView(material, actor, myBatches, myCourses));
    return this.present(materials, actor, myBatches);
  }

  static async getMaterial(identifier: string, actor: StaffActor) {
    const { material, myBatches } = await this.findMaterial(identifier, actor);
    return (await this.present([material], actor, myBatches))[0];
  }

  static async updateMaterial(identifier: string, input: Record<string, any>, actor: StaffActor) {
    const { material, myBatches } = await this.findMaterial(identifier, actor);
    if (!this.canManage(material, actor, myBatches)) throw statusError("You can edit materials only for batches / sections you teach", HttpStatus.FORBIDDEN);
    const update = await this.prepare(input, actor, material);
    if (!this.canManage({ ...material, ...update }, actor, myBatches)) throw statusError("You can add materials only for batches / sections you teach", HttpStatus.FORBIDDEN);
    const saved = await Material.findByIdAndUpdate(material._id, { $set: update }, { new: true, runValidators: true }).lean();
    // A replaced or dropped file is removed from disk.
    if (material.file && material.file.url !== saved.file?.url) removeStoredFile(material.file.url);
    return (await this.present([saved], actor, myBatches))[0];
  }

  static async deleteMaterial(identifier: string, actor: StaffActor) {
    const { material, myBatches } = await this.findMaterial(identifier, actor);
    if (!this.canManage(material, actor, myBatches)) throw statusError("You can delete materials only for batches / sections you teach", HttpStatus.FORBIDDEN);
    await Material.deleteOne({ _id: material._id });
    removeStoredFile(material.file?.url);
    return { message: "Material deleted successfully", material };
  }

  /** Adds course and batch names and whether this user may change the material. */
  private static async present(materials: Record<string, any>[], actor: StaffActor, myBatches: string[]) {
    if (!materials.length) return [];
    const courses = await Course.find({ _id: { $in: materials.map(material => material.courseId) } }).select("courseCode name").lean();
    const batches = await Batch.find({ _id: { $in: materials.flatMap(material => material.batchIds) } }).select("batchCode name").lean();
    const courseById = new Map(courses.map(course => [String(course._id), course]));
    const batchById = new Map(batches.map(batch => [String(batch._id), batch]));
    return materials.map(material => {
      const course = courseById.get(String(material.courseId));
      return {
        _id: material._id, materialCode: material.materialCode, workType: material.workType, title: material.title, description: material.description,
        course: course ? { courseCode: course.courseCode, name: course.name } : null,
        batches: material.batchIds.map(id => batchById.get(String(id))).filter(Boolean).map(batch => ({ batchCode: batch.batchCode, name: batch.name })),
        subject: material.subject, type: material.type, file: material.file, link: material.link, status: material.status,
        publishedAt: material.publishedAt, createdAt: material.createdAt, canManage: this.canManage(material, actor, myBatches),
      };
    });
  }
}
