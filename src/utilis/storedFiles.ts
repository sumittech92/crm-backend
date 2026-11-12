import fs from "node:fs";
import path from "node:path";

export const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");

/** Removes a file this server stored under uploads/<folder>/ (links and other URLs are left alone). */
export const removeStoredFile = (url: string | null | undefined, folder: string) => {
  const relative = String(url || "").split("/uploads/")[1];
  if (!relative?.startsWith(`${folder}/`)) return;
  const file = path.resolve(UPLOAD_ROOT, relative);
  if (file.startsWith(path.join(UPLOAD_ROOT, folder) + path.sep)) fs.unlink(file, () => {});
};

/** True when the URL points at a file this server stored for the owner under uploads/<folder>/<ownerId>/. */
export const isOwnStoredFile = (url: unknown, folder: string, adminId: unknown) => String(url ?? "").includes(`/uploads/${folder}/${adminId}/`);
