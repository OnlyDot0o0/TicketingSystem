// Object storage abstraction for uploaded ticket attachments.
//
// Two implementations, selected by STORAGE_DRIVER ("local" | "s3"),
// defaulting to "local" if unset — same graceful-default, zero-config
// pattern as every other optional integration in this app (SMTP in
// src/lib/mail.ts, CAPTCHA in src/lib/captcha.ts): nothing about the
// default local-disk behavior changes unless you explicitly opt in.
//
// Both drivers are addressed by the same relative "key" this app already
// stores as Attachment.path (e.g. "<ticketId>/<uuid>.jpg") — src/lib/upload.ts
// and src/app/api/uploads/[...path]/route.ts go through this interface
// instead of touching the filesystem (or S3) directly, so neither one needs
// to know which driver is actually active.
//
// S3 env vars (only read when STORAGE_DRIVER=s3):
//   S3_BUCKET               required
//   S3_REGION               required (S3-compatible services still want a
//                            region value even if it's not geographically
//                            meaningful, e.g. Cloudflare R2 uses "auto")
//   S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY   required
//   S3_ENDPOINT             optional — omit for real AWS S3, set for R2/MinIO/
//                            any other S3-compatible endpoint
//   S3_FORCE_PATH_STYLE     optional ("true"/"1") — MinIO and some
//                            self-hosted setups need path-style addressing
//                            (https://host/bucket/key) instead of the
//                            virtual-hosted style AWS uses by default
//                            (https://bucket.host/key); R2/AWS don't need it.

import { mkdir, readFile, writeFile, unlink, stat } from "fs/promises";
import path from "path";

export interface ObjectStorage {
  save(key: string, data: Buffer, contentType: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

// Uploaded files are stored under <project-root>/uploads, which is OUTSIDE
// of /public, so nothing is served statically. Files must go through
// /api/uploads/[...path], which uses this same storage abstraction.
export const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

// Keys are always forward-slash relative paths like "<ticketId>/<uuid>.jpg"
// (see saveUploadedFile in src/lib/upload.ts) — never trust one to be safe
// without checking, since a key derived from a request path
// (src/app/api/uploads/[...path]/route.ts) is attacker-influenced input.
// Rejects absolute paths, backslashes, and ".." traversal segments. This is
// the storage-agnostic replacement for the old local-disk-only
// normalize-and-startsWith check that used to live directly in the route —
// that trick only made sense when "the storage" was always a real
// filesystem path; an S3 key has no filesystem to traverse out of, but a
// ".." segment is still not a key this app ever legitimately generated.
export function assertSafeKey(key: string) {
  if (!key || path.isAbsolute(key) || key.includes("\\")) {
    throw new Error("مفتاح تخزين غير صالح.");
  }
  const segments = key.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    throw new Error("مفتاح تخزين غير صالح.");
  }
}

class LocalDiskStorage implements ObjectStorage {
  async save(key: string, data: Buffer): Promise<void> {
    assertSafeKey(key);
    const fullPath = path.join(UPLOAD_ROOT, key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
  }

  async read(key: string): Promise<Buffer> {
    assertSafeKey(key);
    const fullPath = path.join(UPLOAD_ROOT, key);
    // stat() first (rather than letting readFile's ENOENT bubble up) so a
    // missing file and a real read error are both handled the same
    // deliberate way callers already expect: the route below simply catches
    // whatever this throws and returns 404.
    await stat(fullPath);
    return readFile(fullPath);
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    const fullPath = path.join(UPLOAD_ROOT, key);
    try {
      await unlink(fullPath);
    } catch (err) {
      // Deleting something already gone isn't an error for a delete().
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
}

// S3-compatible driver — works against real AWS S3, Cloudflare R2, or MinIO
// (and anything else speaking the S3 REST API), since they all implement
// the same PutObject/GetObject/DeleteObject contract this driver uses.
//
// NOTE ON VERIFICATION: this class has been reviewed carefully against the
// @aws-sdk/client-s3 API contract (bucket/key shape, command construction)
// and it type-checks, but it has NOT been exercised against a real S3/R2/
// MinIO endpoint in this environment (no Docker, no live credentials
// available here) — see the README's "Object storage abstraction" section
// for the full verified-vs-reasoned-about breakdown. The local driver above
// is the one actually verified end-to-end and remains the zero-config
// default.
class S3Storage implements ObjectStorage {
  private clientPromise: Promise<import("@aws-sdk/client-s3").S3Client> | null = null;
  private bucket: string;

  constructor() {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3.");
    }
    this.bucket = bucket;
  }

  // Lazily import @aws-sdk/client-s3 so the "local" driver (the default,
  // zero-config path every existing deployment of this app is on) never
  // pays for loading/instantiating the S3 SDK at all.
  private async client() {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const { S3Client } = await import("@aws-sdk/client-s3");
        const region = process.env.S3_REGION;
        const accessKeyId = process.env.S3_ACCESS_KEY_ID;
        const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
        if (!region || !accessKeyId || !secretAccessKey) {
          throw new Error(
            "S3_REGION, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY are all required when STORAGE_DRIVER=s3."
          );
        }
        return new S3Client({
          region,
          endpoint: process.env.S3_ENDPOINT || undefined,
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" || process.env.S3_FORCE_PATH_STYLE === "1",
          credentials: { accessKeyId, secretAccessKey },
        });
      })();
    }
    return this.clientPromise;
  }

  async save(key: string, data: Buffer, contentType: string): Promise<void> {
    assertSafeKey(key);
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      })
    );
  }

  async read(key: string): Promise<Buffer> {
    assertSafeKey(key);
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    const res = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error("الملف غير موجود");
    // res.Body is a Node.js Readable in this runtime (StreamingBlobTypes —
    // see @smithy/types). Collecting it manually via async iteration works
    // across SDK minor versions without depending on the optional
    // transformToByteArray() stream-mixin helper.
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as AsyncIterable<Buffer | Uint8Array>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

let storage: ObjectStorage | null = null;

export function getStorage(): ObjectStorage {
  if (!storage) {
    const driver = process.env.STORAGE_DRIVER || "local";
    storage = driver === "s3" ? new S3Storage() : new LocalDiskStorage();
  }
  return storage;
}
