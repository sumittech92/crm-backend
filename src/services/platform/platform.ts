import HttpStatus from "http-status-codes";
import mongoose from "mongoose";
import AuthModel from "../../model/Auth/auth.js";
import Teacher from "../../model/teacher/teacherInfo.js";
import StudentDetailsModel from "../../model/students/studentInfo.js";
import { PlatformSettings, Subscription, Workspace } from "../../model/platform/platform.js";
import { parseDay, todayKey } from "../../utilis/ownerScope.js";
import { blankToNull, insertWithCode, statusError } from "../../utilis/records.js";
import { assertUniqueContact } from "../../utilis/uniqueContact.js";

const OWNER_FIELDS = "fullName email countryCode phoneNumber workType instituteName siteSlug customDomain isBlocked isSuspended disabledModules createdAt lastLogin";

export type SubscriptionStatus = "active" | "dueSoon" | "expired" | "cancelled";

const dayKey = (value: Date | string) => new Date(value).toISOString().slice(0, 10);
const monthKey = (value: Date | string) => new Date(value).toISOString().slice(0, 7);
/** Last `count` months as "YYYY-MM", oldest first. */
const lastMonths = (count: number) => {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(now.getFullYear(), now.getMonth() - (count - 1 - index), 1));
    return date.toISOString().slice(0, 7);
  });
};
/** Adds whole months to a date, keeping the day where the month allows it. */
const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  next.setUTCDate(Math.min(day, new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()));
  return next;
};
const countBy = async (model: mongoose.Model<any>, adminIds: unknown[]) => {
  const rows = await model.aggregate([{ $match: { adminId: { $in: adminIds } } }, { $group: { _id: "$adminId", count: { $sum: 1 } } }]);
  return new Map(rows.map(row => [String(row._id), row.count as number]));
};

export class PlatformService {

  static async settings() {
    return (await PlatformSettings.findOne({ key: "platform" }).lean()) ?? (await PlatformSettings.create({ key: "platform" })).toObject();
  }

  static async updateSettings(input: Record<string, any>) {
    await this.settings();
    const data: Record<string, any> = {};
    if (input.plans) {
      const names = input.plans.map(plan => plan.name.toLowerCase());
      if (new Set(names).size !== names.length) throw statusError("Two plans have the same name", HttpStatus.BAD_REQUEST);
      data.plans = input.plans.map(plan => ({ name: plan.name, amount: plan.amount, description: blankToNull(plan.description) }));
    }
    for (const field of ["supportPhone", "supportEmail", "reminderDays"]) if (input[field] !== undefined) data[field] = blankToNull(input[field]);
    return PlatformSettings.findOneAndUpdate({ key: "platform" }, { $set: data }, { new: true, runValidators: true }).lean();
  }

  static statusOf(subscription: Record<string, any>, reminderDays: number): SubscriptionStatus {
    if (subscription.cancelled) return "cancelled";
    const today = todayKey(), renewal = dayKey(subscription.renewalDate);
    if (renewal < today) return "expired";
    const soon = new Date(`${today}T00:00:00.000Z`);
    soon.setUTCDate(soon.getUTCDate() + reminderDays);
    return renewal <= soon.toISOString().slice(0, 10) ? "dueSoon" : "active";
  }

  private static presentSubscription(subscription: Record<string, any>, reminderDays: number, owner?: Record<string, any>) {
    return {
      ...subscription, status: this.statusOf(subscription, reminderDays),
      institute: owner ? { _id: owner._id, instituteName: owner.instituteName, fullName: owner.fullName, workType: owner.workType } : null,
      paidTotal: (subscription.payments || []).reduce((sum, payment) => sum + payment.amount, 0),
    };
  }

  /** Every owner account with its address / brand, student and teacher counts and current plan. */
  static async workspaces({ search, type, status }: { search?: string; type?: string; status?: string } = {}) {
    const filter: Record<string, any> = { role: "admin", isDeleted: false };
    if (type === "school" || type === "coaching") filter.workType = type;
    if (status === "active") filter.isSuspended = { $ne: true };
    if (status === "inactive") filter.isSuspended = true;
    if (search?.trim()) {
      const value = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ instituteName: value }, { fullName: value }, { email: value }, { phoneNumber: value }];
    }
    const owners = await AuthModel.find(filter).select(OWNER_FIELDS).sort({ createdAt: -1 }).lean();
    return this.withDetails(owners);
  }

  private static async withDetails(owners: Record<string, any>[]) {
    const ids = owners.map(owner => owner._id);
    const [profiles, subscriptions, students, teachers, settings] = await Promise.all([
      Workspace.find({ adminId: { $in: ids } }).lean(), Subscription.find({ adminId: { $in: ids } }).lean(),
      countBy(StudentDetailsModel, ids), countBy(Teacher, ids), this.settings(),
    ]);
    return owners.map(owner => {
      const id = String(owner._id);
      const profile = profiles.find(item => String(item.adminId) === id);
      const subscription = subscriptions.find(item => String(item.adminId) === id);
      return {
        ...owner, isSuspended: !!owner.isSuspended, disabledModules: owner.disabledModules ?? [],
        address: profile?.address ?? null, brandColor: profile?.brandColor ?? "#4871e1", secondaryColor: profile?.secondaryColor ?? "#f5a524", logo: profile?.logo ?? null,
        students: students.get(id) ?? 0, teachers: teachers.get(id) ?? 0,
        subscription: subscription ? this.presentSubscription(subscription, settings.reminderDays) : null,
      };
    });
  }

  private static async owner(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw statusError("Invalid workspace ID", HttpStatus.BAD_REQUEST);
    const owner = await AuthModel.findOne({ _id: id, role: "admin", isDeleted: false }).select(OWNER_FIELDS).lean();
    if (!owner) throw statusError("Workspace not found", HttpStatus.NOT_FOUND);
    return owner;
  }

  static async workspace(id: string) {
    return (await this.withDetails([await this.owner(id)]))[0];
  }

  static async updateWorkspace(id: string, input: Record<string, any>) {
    const owner = await this.owner(id);
    const account: Record<string, any> = {};
    if (input.instituteName !== undefined) account.instituteName = input.instituteName;
    if (input.fullName !== undefined) account.fullName = input.fullName;
    if (input.email !== undefined) account.email = input.email.toLowerCase();
    if (input.phoneNumber !== undefined) account.phoneNumber = input.phoneNumber;
    if (input.disabledModules !== undefined) account.disabledModules = [...new Set(input.disabledModules)];
    await assertUniqueContact({
      email: account.email && account.email !== owner.email ? account.email : undefined,
      countryCode: owner.countryCode ?? "+91",
      phoneNumber: account.phoneNumber && account.phoneNumber !== owner.phoneNumber ? account.phoneNumber : undefined,
    }, owner._id);
    if (Object.keys(account).length) await AuthModel.updateOne({ _id: owner._id }, { $set: account });
    const profile: Record<string, any> = {};
    for (const field of ["address", "brandColor", "secondaryColor", "logo"]) if (input[field] !== undefined) profile[field] = blankToNull(input[field]);
    if (Object.keys(profile).length) await Workspace.findOneAndUpdate({ adminId: owner._id }, { $set: profile }, { upsert: true, runValidators: true });
    return this.workspace(id);
  }

  /** Deactivating signs the owner out; the owner, teachers and students can't use the workspace until it is activated again. */
  static async setActive(id: string, active: boolean) {
    const owner = await this.owner(id);
    await AuthModel.updateOne({ _id: owner._id }, { $set: active ? { isSuspended: false } : { isSuspended: true, accessToken: null } });
    return this.workspace(id);
  }

  // ---------------------------------------------------------------- Subscriptions

  static async subscriptions() {
    const [subscriptions, settings] = await Promise.all([Subscription.find().sort({ renewalDate: 1 }).lean(), this.settings()]);
    const owners = await AuthModel.find({ _id: { $in: subscriptions.map(item => item.adminId) } }).select("instituteName fullName workType isDeleted").lean();
    return subscriptions
      .map(item => ({ item, owner: owners.find(owner => String(owner._id) === String(item.adminId)) }))
      .filter(({ owner }) => owner && !owner.isDeleted)
      .map(({ item, owner }) => this.presentSubscription(item, settings.reminderDays, owner));
  }

  private static dates(input: Record<string, any>, current: Record<string, any> = {}) {
    const data: Record<string, any> = {};
    if (input.startDate !== undefined) data.startDate = parseDay(input.startDate, "start date");
    if (input.renewalDate !== undefined) data.renewalDate = parseDay(input.renewalDate, "renewal date");
    const start = data.startDate ?? current.startDate, renewal = data.renewalDate ?? current.renewalDate;
    if (start && renewal && dayKey(renewal) < dayKey(start)) throw statusError("Renewal date must be on or after the start date", HttpStatus.BAD_REQUEST);
    return data;
  }

  private static async presentOne(id: unknown) {
    const subscription = await Subscription.findById(id).lean();
    const [owner, settings] = await Promise.all([AuthModel.findById(subscription!.adminId).select("instituteName fullName workType").lean(), this.settings()]);
    return this.presentSubscription(subscription!, settings.reminderDays, owner ?? undefined);
  }

  private static async findSubscription(identifier: string) {
    const match = /^\d{6}$/.test(identifier) ? { subscriptionCode: identifier } : mongoose.Types.ObjectId.isValid(identifier) ? { _id: identifier } : null;
    if (!match) throw statusError("Invalid subscription ID", HttpStatus.BAD_REQUEST);
    const subscription = await Subscription.findOne(match).lean();
    if (!subscription) throw statusError("Subscription not found", HttpStatus.NOT_FOUND);
    return subscription;
  }

  static async createSubscription(input: Record<string, any>) {
    const owner = await this.owner(input.adminId);
    if (await Subscription.exists({ adminId: owner._id })) throw statusError(`${owner.instituteName || owner.fullName} already has a plan. Edit or renew it instead.`, HttpStatus.CONFLICT);
    const created = await insertWithCode(Subscription, "subscriptionCode", {
      adminId: owner._id, plan: input.plan, amount: input.amount, cancelled: !!input.cancelled, note: blankToNull(input.note), ...this.dates(input),
    });
    return this.presentOne(created._id);
  }

  static async updateSubscription(identifier: string, input: Record<string, any>) {
    const existing = await this.findSubscription(identifier);
    const data: Record<string, any> = this.dates(input, existing);
    for (const field of ["plan", "amount", "cancelled"]) if (input[field] !== undefined) data[field] = input[field];
    if (input.note !== undefined) data.note = blankToNull(input.note);
    await Subscription.updateOne({ _id: existing._id }, { $set: data }, { runValidators: true });
    return this.presentOne(existing._id);
  }

  /** Records a payment and moves the renewal date forward by `months` (from the renewal date, or today if it already passed). */
  static async renewSubscription(identifier: string, input: Record<string, any>) {
    const existing = await this.findSubscription(identifier);
    const paidOn = input.paidOn ? parseDay(input.paidOn, "paid date") : parseDay(todayKey());
    if (dayKey(paidOn) > todayKey()) throw statusError("Paid date cannot be in the future", HttpStatus.BAD_REQUEST);
    const from = dayKey(existing.renewalDate) < todayKey() ? parseDay(todayKey()) : new Date(existing.renewalDate);
    const payment = { paidOn, months: input.months, amount: input.amount ?? existing.amount * input.months, reference: blankToNull(input.reference) };
    await Subscription.updateOne({ _id: existing._id }, { $set: { renewalDate: addMonths(from, input.months), cancelled: false }, $push: { payments: payment } });
    return this.presentOne(existing._id);
  }

  static async removeSubscription(identifier: string) {
    const existing = await this.findSubscription(identifier);
    await Subscription.deleteOne({ _id: existing._id });
    return { message: "Subscription deleted successfully" };
  }

  // ---------------------------------------------------------------- Dashboard and reports

  static async summary() {
    const months = lastMonths(6);
    const thisMonth = months[months.length - 1];
    const owners = await AuthModel.find({ role: "admin", isDeleted: false }).select(OWNER_FIELDS).sort({ createdAt: -1 }).lean();
    const [workspaces, subscriptions, students, teachers, parents] = await Promise.all([
      this.withDetails(owners), this.subscriptions(), StudentDetailsModel.countDocuments({ adminId: { $ne: null } }),
      Teacher.countDocuments({ adminId: { $ne: null } }), AuthModel.countDocuments({ role: "parent", isDeleted: false }),
    ]);
    const billed = subscriptions.filter(item => item.status === "active" || item.status === "dueSoon");
    const payments = subscriptions.flatMap(item => (item.payments || []).map(payment => ({ ...payment, institute: item.institute?.instituteName || item.institute?.fullName || "Institute" })));
    const revenueByMonth = months.map(month => ({ month, amount: payments.filter(payment => monthKey(payment.paidOn) === month).reduce((sum, payment) => sum + payment.amount, 0) }));
    const activity = [
      ...workspaces.slice(0, 8).map(item => ({ kind: "workspace", title: `New ${item.workType === "school" ? "school" : "coaching center"} added`, detail: item.instituteName || item.fullName, at: item.createdAt })),
      ...payments.map(payment => ({ kind: "payment", title: "Subscription renewed", detail: `${payment.institute} · ₹${payment.amount.toLocaleString("en-IN")}`, at: payment.paidOn })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 6);
    return {
      workspaces: {
        total: workspaces.length, school: workspaces.filter(item => item.workType === "school").length, coaching: workspaces.filter(item => item.workType === "coaching").length,
        active: workspaces.filter(item => !item.isSuspended).length, inactive: workspaces.filter(item => item.isSuspended).length,
        newThisMonth: workspaces.filter(item => monthKey(item.createdAt) === thisMonth).length,
      },
      users: { students, teachers, parents },
      subscriptions: {
        total: subscriptions.length, active: billed.length, dueSoon: subscriptions.filter(item => item.status === "dueSoon").length,
        expired: subscriptions.filter(item => item.status === "expired").length, mrr: billed.reduce((sum, item) => sum + item.amount, 0),
      },
      revenue: { thisMonth: revenueByMonth[revenueByMonth.length - 1].amount, byMonth: revenueByMonth, total: payments.reduce((sum, payment) => sum + payment.amount, 0) },
      growth: months.map(month => ({ month, count: workspaces.filter(item => monthKey(item.createdAt) === month).length })),
      recentWorkspaces: workspaces.slice(0, 5),
      topWorkspaces: [...workspaces].sort((a, b) => b.students - a.students).slice(0, 5),
      renewals: subscriptions.filter(item => item.status === "dueSoon" || item.status === "expired").slice(0, 8),
      activity,
    };
  }
}
