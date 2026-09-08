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

// file.type is just what the browser/client claims in the multipart
// request — never otherwise verified against the actual bytes. Without
// this, an attacker could upload arbitrary content (e.g. an HTML/SVG/JS
// payload) declared as "image/png": assertValidUpload() above only checks
// the claimed string, and src/app/api/uploads/[...path]/route.ts later
// serves the file back with Content-Type set from that same unverified
// claim and Content-Disposition: inline. Checking the real file signature
// closes that at the source instead of only trusting the label.
const SIGNATURE_CHECKS: Record<string, (buf: Buffer) => boolean> = {
  "image/png": (buf) =>
    buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  "image/webp": (buf) =>
    buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP",
  "application/pdf": (buf) => buf.length >= 5 && buf.subarray(0, 5).toString("ascii") === "%PDF-",
};

export function assertMatchesSignature(mimeType: string, buffer: Buffer) {
  const check = SIGNATURE_CHECKS[mimeType];
  if (!check || !check(buffer)) {
    throw new UploadValidationError("محتوى الملف لا يطابق نوعه المعلن.");
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
  assertMatchesSignature(file.type, buffer);
  await getStorage().save(storedPath, buffer, file.type);

  return {
    filename: file.name,
    storedPath,
    mimeType: file.type,
    size: file.size,
  };
}
