import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_SIZE_BYTES } from "./config";

// Uploaded files are stored under <project-root>/uploads, which is OUTSIDE
// of /public, so nothing is served statically. Files must go through the
// /api/uploads/[...path] route, giving us a seam to add access control later.
export const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

export class UploadValidationError extends Error {}

export function assertValidUpload(file: { type: string; size: number }) {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new UploadValidationError("نوع الملف غير مدعوم. يُسمح فقط بصور (jpg, png, webp) أو PDF.");
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new UploadValidationError("حجم الملف يتجاوز الحد المسموح (8 ميجابايت).");
  }
}

export async function saveUploadedFile(ticketId: string, file: File): Promise<{
  filename: string;
  storedPath: string;
  mimeType: string;
  size: number;
}> {
  assertValidUpload(file);

  const ticketDir = path.join(UPLOAD_ROOT, ticketId);
  await mkdir(ticketDir, { recursive: true });

  const ext = path.extname(file.name) || "";
  const safeName = `${crypto.randomUUID()}${ext}`;
  const fullPath = path.join(ticketDir, safeName);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, buffer);

  return {
    filename: file.name,
    storedPath: path.join(ticketId, safeName),
    mimeType: file.type,
    size: file.size,
  };
}
