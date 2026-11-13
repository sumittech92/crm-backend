import SchoolEvent from "../../model/event/event.js";
import type { StaffScope } from "../../utilis/ownerScope.js";
import { parseDay, todayKey } from "../../utilis/ownerScope.js";
import { blankToNull, findScoped, insertWithCode } from "../../utilis/records.js";

const FIELDS = ["name", "startTime", "venue", "audience", "description", "cancelled"];

export type EventStatus = "upcoming" | "completed" | "cancelled";

export class EventService {

  static statusOf(event: Record<string, any>): EventStatus {
    if (event.cancelled) return "cancelled";
    return new Date(event.date).toISOString().slice(0, 10) < todayKey() ? "completed" : "upcoming";
  }

  private static present(event: Record<string, any>) {
    return { ...event, status: this.statusOf(event) };
  }

  private static prepare(input: Record<string, any>) {
    const data: Record<string, any> = {};
    for (const field of FIELDS) if (input[field] !== undefined) data[field] = blankToNull(input[field]);
    if (input.date !== undefined) data.date = parseDay(input.date, "event date");
    return data;
  }

  /** Upcoming events first (soonest first), then past events (latest first). */
  static async list(scope: StaffScope, { status }: { status?: string } = {}) {
    const events = (await SchoolEvent.find(scope).lean()).map(event => this.present(event));
    const today = todayKey();
    const key = (event: Record<string, any>) => new Date(event.date).toISOString().slice(0, 10);
    return events
      .filter(event => !status || event.status === status)
      .sort((a, b) => {
        const aPast = key(a) < today, bPast = key(b) < today;
        if (aPast !== bPast) return aPast ? 1 : -1;
        return aPast ? key(b).localeCompare(key(a)) : key(a).localeCompare(key(b));
      });
  }

  static async create(input: Record<string, any>, workType: string, adminId: unknown) {
    const created = await insertWithCode(SchoolEvent, "eventCode", { audience: "all", ...this.prepare(input), adminId, workType });
    return this.present(created.toObject());
  }

  static async update(identifier: string, input: Record<string, any>, scope: StaffScope) {
    const existing = await findScoped(SchoolEvent, "eventCode", identifier, scope, "event");
    const saved = await SchoolEvent.findByIdAndUpdate(existing._id, { $set: this.prepare(input) }, { new: true, runValidators: true }).lean();
    return this.present(saved);
  }

  static async remove(identifier: string, scope: StaffScope) {
    const existing = await findScoped(SchoolEvent, "eventCode", identifier, scope, "event");
    await SchoolEvent.deleteOne({ _id: existing._id });
    return { message: "Event deleted successfully", event: existing };
  }
}
