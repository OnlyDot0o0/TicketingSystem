import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { getStorage, assertSafeKey, UPLOAD_ROOT } from "@/lib/storage";

// STORAGE_DRIVER is unset in the test env, so getStorage() returns the
// default LocalDiskStorage driver — the one actually used in production
// today (S3 is opt-in via STORAGE_DRIVER=s3 and isn't exercised here, same
// as the README documents for the app itself: the local driver is the
// verified, real-disk-I/O path).
describe("assertSafeKey", () => {
  it("accepts a normal relative key", () => {
    expect(() => assertSafeKey("ticket123/abc-def.png")).not.toThrow();
  });

  it("rejects an empty key", () => {
    expect(() => assertSafeKey("")).toThrow();
  });

  it("rejects an absolute path", () => {
    expect(() => assertSafeKey("/etc/passwd")).toThrow();
    expect(() => assertSafeKey("C:/Windows/System32")).toThrow();
  });

  it("rejects backslashes (Windows-style separators aren't a valid key shape)", () => {
    expect(() => assertSafeKey("ticket123\\..\\..\\evil.png")).toThrow();
  });

  it("rejects '..' traversal segments", () => {
    expect(() => assertSafeKey("../../etc/passwd")).toThrow();
    expect(() => assertSafeKey("ticket123/../../../etc/passwd")).toThrow();
  });

  it("rejects a bare '.' segment", () => {
    expect(() => assertSafeKey("ticket123/./file.png")).toThrow();
  });

  it("rejects empty segments (double slashes)", () => {
    expect(() => assertSafeKey("ticket123//file.png")).toThrow();
  });
});

describe("LocalDiskStorage (real disk I/O, via getStorage())", () => {
  const testKeys: string[] = [];

  afterEach(async () => {
    // Best-effort cleanup even if a test's own delete() assertion already
    // removed the file, and clean up the unique per-test subfolder under
    // uploads/ so this suite never leaves stray files behind.
    for (const key of testKeys.splice(0)) {
      await fs.rm(path.join(UPLOAD_ROOT, path.dirname(key)), { recursive: true, force: true });
    }
  });

  function testKey(ext = "txt") {
    const key = `__vitest__/${randomUUID()}.${ext}`;
    testKeys.push(key);
    return key;
  }

  it("round-trips save -> read with identical bytes", async () => {
    const storage = getStorage();
    const key = testKey();
    const data = Buffer.from("hello from vitest \u{1F9EA}", "utf-8");

    await storage.save(key, data, "text/plain");
    const readBack = await storage.read(key);

    expect(Buffer.compare(readBack, data)).toBe(0);
  });

  it("delete() removes the file — a subsequent read() fails", async () => {
    const storage = getStorage();
    const key = testKey();
    await storage.save(key, Buffer.from("temporary"), "text/plain");
    await storage.read(key); // sanity: exists first

    await storage.delete(key);

    await expect(storage.read(key)).rejects.toThrow();
  });

  it("delete() on an already-missing file does not throw (idempotent)", async () => {
    const storage = getStorage();
    const key = testKey();
    await expect(storage.delete(key)).resolves.not.toThrow();
  });

  it("save() rejects an unsafe key before touching disk", async () => {
    const storage = getStorage();
    await expect(storage.save("../escape.png", Buffer.from("x"), "text/plain")).rejects.toThrow();
  });
});
