import HttpStatus from "http-status-codes";
import mongoose from "mongoose";
import Post from "../../model/post/post.js";
import { generateSixDigitId } from "../../utilis/generateId.js";
import { parseDay, todayKey } from "../../utilis/ownerScope.js";
import { StaffActor, actorScope, isOwnerLike } from "../../utilis/staffAccess.js";
import { isOwnStoredFile, removeStoredFile } from "../../utilis/storedFiles.js";

const statusError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const dayKey = (date: Date | string) => new Date(date).toISOString().slice(0, 10);
const TYPE_LABELS: Record<string, string> = { image: "Post", video: "Video", text: "Post", announcement: "Announcement" };

/** Owners manage every post; teachers manage the posts they wrote. */
const canManage = (post: Record<string, any>, actor: StaffActor) => isOwnerLike(actor) || String(post.createdBy) === String(actor.userId);

export class PostService {

  private static prepare(input: Record<string, any>, actor: StaffActor, current?: Record<string, any>) {
    const adminId = current?.adminId ?? actor.adminId;
    const data: Record<string, any> = {};
    for (const field of ["title", "description", "type", "pinned", "showOnWebsite", "status"]) if (input[field] !== undefined) data[field] = input[field];
    if (input.publishDate !== undefined) data.publishDate = input.publishDate ? parseDay(input.publishDate, "publish date") : parseDay(todayKey());
    if (input.imageUrl !== undefined) {
      if (input.imageUrl && !isOwnStoredFile(input.imageUrl, "media", adminId)) throw statusError("Upload the image again", HttpStatus.BAD_REQUEST);
      data.imageUrl = input.imageUrl || null;
    }
    if (input.videoLink !== undefined) data.videoLink = input.videoLink || null;
    const next = { ...current, ...data };
    if (next.type === "image" && !next.imageUrl) throw statusError("Add a photo for an image post", HttpStatus.BAD_REQUEST);
    if (next.type === "video" && !next.videoLink) throw statusError("Add the video link (YouTube, Google Drive, Vimeo…)", HttpStatus.BAD_REQUEST);
    if (next.type !== "video") data.videoLink = null;
    if (!isOwnerLike(actor) && data.showOnWebsite) throw statusError("Only the owner can show posts on the website", HttpStatus.FORBIDDEN);
    return data;
  }

  static async createPost(input: Record<string, any>, actor: StaffActor, authorName: string | null) {
    if (!actor.adminId || !actor.workType) throw statusError("Only an Owner or teacher can create posts", HttpStatus.FORBIDDEN);
    const data = { adminId: actor.adminId, workType: actor.workType, createdBy: actor.userId, authorName, publishDate: parseDay(todayKey()), ...this.prepare({ type: "text", ...input }, actor) };
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        return this.present((await Post.create({ ...data, postCode: generateSixDigitId() })).toObject(), actor);
      } catch (error) {
        if (!(error.code === 11000 && error.keyPattern?.postCode) || attempt === 9) throw error;
      }
    }
    throw new Error("Unable to generate a unique post ID");
  }

  private static async findPost(identifier: string, actor: StaffActor) {
    const text = String(identifier ?? "").trim();
    const match = /^\d{6}$/.test(text) ? { postCode: text } : mongoose.Types.ObjectId.isValid(text) ? { _id: text } : null;
    if (!match) throw statusError("Invalid post ID", HttpStatus.BAD_REQUEST);
    const post = await Post.findOne({ ...match, ...actorScope(actor) }).lean();
    // Teachers see published posts and their own drafts.
    if (!post || (post.status === "draft" && !canManage(post, actor))) throw statusError("Post not found", HttpStatus.NOT_FOUND);
    return post;
  }

  static async getAllPosts(actor: StaffActor) {
    const posts = await Post.find(actorScope(actor)).sort({ pinned: -1, publishDate: -1, createdAt: -1 }).lean();
    return posts.filter(post => post.status === "published" || canManage(post, actor)).map(post => this.present(post, actor));
  }

  static async updatePost(identifier: string, input: Record<string, any>, actor: StaffActor) {
    const post = await this.findPost(identifier, actor);
    if (!canManage(post, actor)) throw statusError("You can edit only your own posts", HttpStatus.FORBIDDEN);
    const update = this.prepare(input, actor, post);
    const saved = await Post.findByIdAndUpdate(post._id, { $set: update }, { new: true, runValidators: true }).lean();
    if (post.imageUrl && post.imageUrl !== saved.imageUrl) removeStoredFile(post.imageUrl, "media");
    return this.present(saved, actor);
  }

  static async deletePost(identifier: string, actor: StaffActor) {
    const post = await this.findPost(identifier, actor);
    if (!canManage(post, actor)) throw statusError("You can delete only your own posts", HttpStatus.FORBIDDEN);
    await Post.deleteOne({ _id: post._id });
    removeStoredFile(post.imageUrl, "media");
    return { message: "Post deleted successfully", post };
  }

  private static present(post: Record<string, any>, actor: StaffActor) {
    const scheduled = dayKey(post.publishDate) > todayKey();
    return { ...post, state: post.status === "draft" ? "draft" : scheduled ? "scheduled" : "live", canManage: canManage(post, actor) };
  }

  /** Live posts the owner chose to show on the public website, in the website's news-item shape. */
  static async websiteUpdates(adminId: unknown) {
    const posts = await Post.find({ adminId, showOnWebsite: true, status: "published" }).sort({ pinned: -1, publishDate: -1 }).limit(20).lean();
    return posts.filter(post => dayKey(post.publishDate) <= todayKey()).map(post => ({
      title: post.title, description: post.description, type: TYPE_LABELS[post.type] || "Post",
      date: new Date(post.publishDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }),
      ...(post.imageUrl ? { media: post.imageUrl } : {}), ...(post.videoLink ? { link: post.videoLink } : {}), status: "Published",
    }));
  }
}
