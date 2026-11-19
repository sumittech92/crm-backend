import HttpStatus from "http-status-codes";
import { Lab, LabEquipment } from "../../model/lab/lab.js";
import Teacher from "../../model/teacher/teacherInfo.js";
import type { StaffScope } from "../../utilis/ownerScope.js";
import { parseDay, todayKey } from "../../utilis/ownerScope.js";
import { blankToNull, findScoped, insertWithCode, sameName, statusError } from "../../utilis/records.js";

const LAB_FIELDS = ["name", "type", "room", "capacity", "description", "status"];
const EQUIPMENT_FIELDS = ["name", "quantity", "condition", "note", "status"];

export class LabService {

  private static async inCharge(code: unknown, scope: StaffScope) {
    const teacherCode = blankToNull(code);
    if (!teacherCode) return { inChargeCode: null, inChargeName: null };
    const teacher = await Teacher.findOne({ teacherCode, ...scope }).select("teacherCode fullName").lean();
    if (!teacher) throw statusError("Teacher not found", HttpStatus.NOT_FOUND);
    return { inChargeCode: teacher.teacherCode, inChargeName: teacher.fullName };
  }

  /** Lab names are unique per institute (ignoring case). */
  private static async checkName(name: string, scope: StaffScope, exceptId?: unknown) {
    const filter: Record<string, any> = { ...scope, name: sameName(name) };
    if (exceptId) filter._id = { $ne: exceptId };
    if (await Lab.exists(filter)) throw statusError("A lab with this name already exists", HttpStatus.CONFLICT);
  }

  /** Labs with how many equipment items (and how many need attention) each has. */
  static async listLabs(scope: StaffScope) {
    const labs = await Lab.find(scope).sort({ name: 1 }).lean();
    const equipment = await LabEquipment.find({ ...scope, lab: { $in: labs.map(lab => lab._id) } }).select("lab quantity condition").lean();
    return labs.map(lab => {
      const items = equipment.filter(item => String(item.lab) === String(lab._id));
      return { ...lab, equipmentCount: items.length, needsAttention: items.filter(item => item.condition !== "working").length };
    });
  }

  static async createLab(input: Record<string, any>, workType: string, adminId: unknown) {
    const scope = { workType: workType as StaffScope["workType"], adminId };
    await this.checkName(input.name, scope);
    const data: Record<string, any> = {};
    for (const field of LAB_FIELDS) if (input[field] !== undefined) data[field] = blankToNull(input[field]);
    const created = await insertWithCode(Lab, "labCode", { ...data, ...(await this.inCharge(input.inChargeCode, scope)), adminId, workType });
    return { ...created.toObject(), equipmentCount: 0, needsAttention: 0 };
  }

  static async updateLab(identifier: string, input: Record<string, any>, scope: StaffScope) {
    const existing = await findScoped(Lab, "labCode", identifier, scope, "lab");
    if (input.name) await this.checkName(input.name, scope, existing._id);
    const data: Record<string, any> = {};
    for (const field of LAB_FIELDS) if (input[field] !== undefined) data[field] = blankToNull(input[field]);
    if (input.inChargeCode !== undefined) Object.assign(data, await this.inCharge(input.inChargeCode, scope));
    await Lab.updateOne({ _id: existing._id }, { $set: data }, { runValidators: true });
    return (await this.listLabs(scope)).find(lab => String(lab._id) === String(existing._id));
  }

  /** A lab with equipment can't be deleted until its equipment is removed or moved. */
  static async removeLab(identifier: string, scope: StaffScope) {
    const existing = await findScoped(Lab, "labCode", identifier, scope, "lab");
    if (await LabEquipment.exists({ lab: existing._id })) throw statusError("Remove or move this lab's equipment before deleting it", HttpStatus.CONFLICT);
    await Lab.deleteOne({ _id: existing._id });
    return { message: "Lab deleted successfully", lab: existing };
  }

  private static async labFor(labCode: string, scope: StaffScope) {
    const lab = await Lab.findOne({ labCode, ...scope }).select("labCode name").lean();
    if (!lab) throw statusError("Lab not found", HttpStatus.NOT_FOUND);
    return lab;
  }

  private static present(item: Record<string, any>, labs: Record<string, any>[]) {
    const lab = labs.find(entry => String(entry._id) === String(item.lab));
    return { ...item, labCode: lab?.labCode ?? null, labName: lab?.name ?? "—" };
  }

  private static prepareEquipment(input: Record<string, any>) {
    const data: Record<string, any> = {};
    for (const field of EQUIPMENT_FIELDS) if (input[field] !== undefined) data[field] = blankToNull(input[field]);
    if (input.purchaseDate !== undefined) {
      data.purchaseDate = blankToNull(input.purchaseDate) ? parseDay(input.purchaseDate, "purchase date") : null;
      if (data.purchaseDate && data.purchaseDate.toISOString().slice(0, 10) > todayKey()) throw statusError("Purchase date cannot be in the future", HttpStatus.BAD_REQUEST);
    }
    return data;
  }

  static async listEquipment(scope: StaffScope, { lab }: { lab?: string } = {}) {
    const labs = await Lab.find(scope).select("labCode name").lean();
    const filter: Record<string, any> = { ...scope };
    if (lab) filter.lab = labs.find(entry => entry.labCode === lab)?._id ?? null;
    return (await LabEquipment.find(filter).sort({ name: 1 }).lean()).map(item => this.present(item, labs));
  }

  static async createEquipment(input: Record<string, any>, workType: string, adminId: unknown) {
    const scope = { workType: workType as StaffScope["workType"], adminId };
    const lab = await this.labFor(input.labCode, scope);
    const created = await insertWithCode(LabEquipment, "equipmentCode", { ...this.prepareEquipment(input), lab: lab._id, adminId, workType });
    return this.present(created.toObject(), [lab]);
  }

  static async updateEquipment(identifier: string, input: Record<string, any>, scope: StaffScope) {
    const existing = await findScoped(LabEquipment, "equipmentCode", identifier, scope, "equipment");
    const data = this.prepareEquipment(input);
    if (input.labCode) data.lab = (await this.labFor(input.labCode, scope))._id;
    const saved = await LabEquipment.findByIdAndUpdate(existing._id, { $set: data }, { new: true, runValidators: true }).lean();
    return this.present(saved, await Lab.find(scope).select("labCode name").lean());
  }

  static async removeEquipment(identifier: string, scope: StaffScope) {
    const existing = await findScoped(LabEquipment, "equipmentCode", identifier, scope, "equipment");
    await LabEquipment.deleteOne({ _id: existing._id });
    return { message: "Equipment deleted successfully", equipment: existing };
  }
}
