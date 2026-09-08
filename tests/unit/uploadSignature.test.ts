import { describe, it, expect } from "vitest";
import { assertMatchesSignature, UploadValidationError } from "@/lib/upload";

// file.type is just a client-supplied claim in the multipart request —
// never otherwise verified. Without this check, an attacker could upload
// arbitrary content (e.g. an HTML/script payload) declared as "image/png";
// src/app/api/uploads/[...path]/route.ts later serves it back with
// Content-Type set from that same unverified claim and
// Content-Disposition: inline. This checks the real file signature against
// the declared MIME type before anything is written to storage.

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const PDF_SIG = Buffer.from("%PDF-1.4\n...", "ascii");
const WEBP_SIG = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x00, 0x00, 0x00, 0x00]), // file size field, irrelevant to the check
  Buffer.from("WEBP", "ascii"),
]);
const HTML_PAYLOAD = Buffer.from("<script>alert(document.cookie)</script>", "ascii");

describe("assertMatchesSignature", () => {
  it("accepts a real PNG declared as image/png", () => {
    expect(() => assertMatchesSignature("image/png", PNG_SIG)).not.toThrow();
  });

  it("accepts a real JPEG declared as image/jpeg", () => {
    expect(() => assertMatchesSignature("image/jpeg", JPEG_SIG)).not.toThrow();
  });

  it("accepts a real WebP declared as image/webp", () => {
    expect(() => assertMatchesSignature("image/webp", WEBP_SIG)).not.toThrow();
  });

  it("accepts a real PDF declared as application/pdf", () => {
    expect(() => assertMatchesSignature("application/pdf", PDF_SIG)).not.toThrow();
  });

  it("rejects an HTML/script payload declared as image/png", () => {
    expect(() => assertMatchesSignature("image/png", HTML_PAYLOAD)).toThrow(UploadValidationError);
  });

  it("rejects an HTML/script payload declared as application/pdf", () => {
    expect(() => assertMatchesSignature("application/pdf", HTML_PAYLOAD)).toThrow(UploadValidationError);
  });

  it("rejects content/type mismatch across the allowed types (a real PDF declared as image/png)", () => {
    expect(() => assertMatchesSignature("image/png", PDF_SIG)).toThrow(UploadValidationError);
  });

  it("rejects a mime type outside the checked set entirely", () => {
    expect(() => assertMatchesSignature("text/html", HTML_PAYLOAD)).toThrow(UploadValidationError);
  });

  it("rejects a truncated/empty buffer", () => {
    expect(() => assertMatchesSignature("image/png", Buffer.alloc(0))).toThrow(UploadValidationError);
    expect(() => assertMatchesSignature("image/png", Buffer.from([0x89, 0x50]))).toThrow(UploadValidationError);
  });
});
