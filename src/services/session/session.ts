import HttpStatus from "http-status-codes";
import AcademicSession from "../../model/session/session.js";
import type { StaffScope } from "../../utilis/ownerScope.js";
import { parseDay } from "../../utilis/ownerScope.js";
import { blankToNull, findScoped, insertWithCode, sameName, statusError } from "../../utilis/records.js";

const day = (date: Date) => new Date(date).toISOString().slice(0, 10);

export class SessionService {

  /** Builds stored fields from the request; `current` is the saved session when updating. */
  private static prepare(input: Record<string, any>, current?: Record<string, any>) {
    const data: Record<string, any> = {};
    if (input.name !== undefined) data.name = String(input.name).trim();
    if (input.startDate !== undefined) data.startDate = parseDay(input.startDate, "start date");
    if (input.endDate !== undefined) data.endDate = parseDay(input.endDate, "end date");
    if (input.terms !== undefined) data.terms = [...new Map((input.terms as string[]).map(term => String(term).trim()).filter(Boolean).map(term => [term.toLowerCase(), term])).values()];
    if (input.status !== undefined) data.status = blankToNull(input.status) ?? "upcoming";
    const next = { ...current, ...data };
    if (next.endDate < next.startDate) throw statusError("End date must be on or after the start date", HttpStatus.BAD_REQUEST);
    return { data, next };
  }

  /** Names are unique and dates may not overlap another session of the institute. */
  private static async check(session: Record<string, any>, exceptId?: unknown) {
    const others = await AcademicSession.find({ adminId: session.adminId, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).lean();
    if (others.some(other => sameName(session.name).test(other.name))) throw statusError(`A session named “${session.name}” already exists`, HttpStatus.CONFLICT);
    const overlap = others.find(other => other.startDate <= session.endDate && session.startDate <= other.endDate);
    if (overlap) throw statusError(`Dates overlap with session “${overlap.name}” (${day(overlap.startDate)} to ${day(overlap.endDate)})`, HttpStatus.CONFLICT);
  }

  /** Only one session is current: making one current moves the previous one to completed (or upcoming if it is later). */
  private static async demoteOthers(session: Record<string, any>, exceptId: unknown) {
    if (session.status !== "current") return;
    const others = await AcademicSession.find({ adminId: session.adminId, status: "current", _id: { $ne: exceptId } }).select("_id startDate").lean();
    await Promise.all(others.map(other => AcademicSession.updateOne({ _id: other._id }, { $set: { status: other.startDate < session.startDate ? "completed" : "upcoming" } })));
  }

  static async list(scope: StaffScope) {
    return AcademicSession.find(scope).sort({ startDate: -1 }).lean();
  }

  static async create(input: Record<string, any>, workType: string, adminId: unknown) {
    const { next } = this.prepare(input);
    const session = { status: "upcoming", ...next, adminId, workType };
    await this.check(session);
    const created = (await insertWithCode(AcademicSession, "sessionCode", session)).toObject();
    await this.demoteOthers(created, created._id);
    return created;
  }

  static async update(identifier: string, input: Record<string, any>, scope: StaffScope) {
    const existing = await findScoped(AcademicSession, "sessionCode", identifier, scope, "session");
    const { data, next } = this.prepare(input, existing);
    await this.check(next, existing._id);
    const saved = await AcademicSession.findByIdAndUpdate(existing._id, { $set: data }, { new: true, runValidators: true }).lean();
    await this.demoteOthers(saved, saved._id);
    return saved;
  }

  static async remove(identifier: string, scope: StaffScope) {
    const existing = await findScoped(AcademicSession, "sessionCode", identifier, scope, "session");
    await AcademicSession.deleteOne({ _id: existing._id });
    return { message: "Session deleted successfully", session: existing };
  }
}
