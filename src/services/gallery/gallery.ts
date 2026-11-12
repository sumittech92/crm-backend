import HttpStatus from "http-status-codes";
import mongoose from "mongoose";
import Album, { MAX_ALBUM_ITEMS } from "../../model/gallery/album.js";
import { generateSixDigitId } from "../../utilis/generateId.js";
import { parseDay, todayKey } from "../../utilis/ownerScope.js";
import { StaffActor, actorScope, isOwnerLike } from "../../utilis/staffAccess.js";
import { isOwnStoredFile, removeStoredFile } from "../../utilis/storedFiles.js";

const statusError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

/** Owners manage every album; teachers manage the albums they created. */
const canManage = (album: Record<string, any>, actor: StaffActor) => isOwnerLike(actor) || String(album.createdBy) === String(actor.userId);

export class GalleryService {

  private static prepare(input: Record<string, any>, actor: StaffActor, current?: Record<string, any>) {
    const data: Record<string, any> = {};
    for (const field of ["name", "description", "showOnWebsite", "status"]) if (input[field] !== undefined) data[field] = typeof input[field] === "string" && !input[field].trim() ? null : input[field];
    if (input.date !== undefined) data.date = input.date ? parseDay(input.date, "date") : parseDay(todayKey());
    if (input.coverItemId !== undefined) {
      if (input.coverItemId && !(current?.items || []).some(item => String(item._id) === input.coverItemId && item.kind === "image")) throw statusError("Choose a photo from this album as the cover", HttpStatus.BAD_REQUEST);
      data.coverItemId = input.coverItemId || null;
    }
    if (!isOwnerLike(actor) && data.showOnWebsite) throw statusError("Only the owner can show albums on the website", HttpStatus.FORBIDDEN);
    return data;
  }

  static async createAlbum(input: Record<string, any>, actor: StaffActor) {
    if (!actor.adminId || !actor.workType) throw statusError("Only an Owner or teacher can create albums", HttpStatus.FORBIDDEN);
    const data = { adminId: actor.adminId, workType: actor.workType, createdBy: actor.userId, date: parseDay(todayKey()), ...this.prepare(input, actor) };
    delete data.coverItemId;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        return this.present((await Album.create({ ...data, albumCode: generateSixDigitId() })).toObject(), actor);
      } catch (error) {
        if (!(error.code === 11000 && error.keyPattern?.albumCode) || attempt === 9) throw error;
      }
    }
    throw new Error("Unable to generate a unique album ID");
  }

  private static async findAlbum(identifier: string, actor: StaffActor) {
    const text = String(identifier ?? "").trim();
    const match = /^\d{6}$/.test(text) ? { albumCode: text } : mongoose.Types.ObjectId.isValid(text) ? { _id: text } : null;
    if (!match) throw statusError("Invalid album ID", HttpStatus.BAD_REQUEST);
    const album = await Album.findOne({ ...match, ...actorScope(actor) }).lean();
    if (!album || (album.status === "draft" && !canManage(album, actor))) throw statusError("Album not found", HttpStatus.NOT_FOUND);
    return album;
  }

  private static async findManaged(identifier: string, actor: StaffActor) {
    const album = await this.findAlbum(identifier, actor);
    if (!canManage(album, actor)) throw statusError("You can change only your own albums", HttpStatus.FORBIDDEN);
    return album;
  }

  static async getAllAlbums(actor: StaffActor) {
    const albums = await Album.find(actorScope(actor)).sort({ date: -1, createdAt: -1 }).lean();
    return albums.filter(album => album.status === "published" || canManage(album, actor)).map(album => this.present(album, actor));
  }

  static async getAlbum(identifier: string, actor: StaffActor) {
    return this.present(await this.findAlbum(identifier, actor), actor);
  }

  static async updateAlbum(identifier: string, input: Record<string, any>, actor: StaffActor) {
    const album = await this.findManaged(identifier, actor);
    const saved = await Album.findByIdAndUpdate(album._id, { $set: this.prepare(input, actor, album) }, { new: true, runValidators: true }).lean();
    return this.present(saved, actor);
  }

  /** Adds uploaded photos (from POST /upload/media) and video links; the first photo becomes the cover if none is set. */
  static async addItems(identifier: string, items: Record<string, any>[], actor: StaffActor) {
    const album = await this.findManaged(identifier, actor);
    if (album.items.length + items.length > MAX_ALBUM_ITEMS) throw statusError(`An album holds up to ${MAX_ALBUM_ITEMS} photos and videos (${MAX_ALBUM_ITEMS - album.items.length} more allowed)`, HttpStatus.BAD_REQUEST);
    if (items.some(item => item.kind === "image" && !isOwnStoredFile(item.url, "media", album.adminId))) throw statusError("Upload the photos again", HttpStatus.BAD_REQUEST);
    const added = items.map(item => ({ _id: new mongoose.Types.ObjectId(), kind: item.kind, url: item.url, caption: item.caption || null, size: item.size ?? null }));
    const cover = album.coverItemId ?? added.find(item => item.kind === "image")?._id ?? null;
    const saved = await Album.findByIdAndUpdate(album._id, { $push: { items: { $each: added } }, $set: { coverItemId: cover } }, { new: true }).lean();
    return this.present(saved, actor);
  }

  static async removeItem(identifier: string, itemId: string, actor: StaffActor) {
    const album = await this.findManaged(identifier, actor);
    const item = album.items.find(entry => String(entry._id) === String(itemId));
    if (!item) throw statusError("Photo not found in this album", HttpStatus.NOT_FOUND);
    const remaining = album.items.filter(entry => entry !== item);
    const cover = String(album.coverItemId) === String(item._id) ? remaining.find(entry => entry.kind === "image")?._id ?? null : album.coverItemId;
    const saved = await Album.findByIdAndUpdate(album._id, { $pull: { items: { _id: item._id } }, $set: { coverItemId: cover } }, { new: true }).lean();
    removeStoredFile(item.url, "media");
    return this.present(saved, actor);
  }

  static async deleteAlbum(identifier: string, actor: StaffActor) {
    const album = await this.findManaged(identifier, actor);
    await Album.deleteOne({ _id: album._id });
    album.items.forEach(item => removeStoredFile(item.url, "media"));
    return { message: "Album deleted successfully", album: { albumCode: album.albumCode, name: album.name } };
  }

  private static present(album: Record<string, any>, actor: StaffActor) {
    const cover = album.items.find(item => String(item._id) === String(album.coverItemId)) ?? album.items.find(item => item.kind === "image") ?? null;
    return { ...album, coverUrl: cover?.url ?? null, canManage: canManage(album, actor) };
  }

  /** Photos of published albums the owner chose to show on the public website, in the website's gallery-item shape. */
  static async websiteGallery(adminId: unknown) {
    const albums = await Album.find({ adminId, showOnWebsite: true, status: "published" }).sort({ date: -1 }).limit(10).lean();
    return albums.flatMap(album => album.items.filter(item => item.kind === "image").map(item => ({
      title: item.caption || album.name, media: item.url, album: album.name,
      date: new Date(album.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }), status: "Published",
    }))).slice(0, 60);
  }
}
