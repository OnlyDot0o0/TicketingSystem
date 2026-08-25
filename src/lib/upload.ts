import path from "path";
import crypto from "crypto";
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_SIZE_BYTES } from "./config";
import { getStorage } from "./storage";

// Actual reads/writes go through src/lib/storage.ts's ObjectStorage
// abstraction below, not straight to the filesystem — see that file for the
// local-disk (default) vs. S3-compatible drivers, selected via
// STORAGE_DRIVER. src/app/api/uploads/[...path]/route.ts (the read side)
// goes through the same abstraction, via the same getStorage().

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

  const ext = path.extname(file.name) || "";
  const safeName = `${crypto.randomUUID()}${ext}`;
  // Forward slashes always — this is a storage key (local disk today,
  // possibly S3 tomorrow), not a raw OS path, so it must stay
  // platform-independent even when this runs on Windows.
  const storedPath = `${ticketId}/${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  await getStorage().save(storedPath, buffer, file.type);

  return {
    filename: file.name,
    storedPath,
    mimeType: file.type,
    size: file.size,
  };
}
