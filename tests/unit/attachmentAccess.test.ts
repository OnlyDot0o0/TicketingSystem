import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { signAttachmentUrl, verifyAttachmentToken } from "@/lib/attachmentAccess";

// NEXTAUTH_SECRET is set in vitest.config.ts's test.env — signAttachmentUrl/
// verifyAttachmentToken both throw without it.

function parseSignedUrl(url: string): { path: string; exp: string; sig: string } {
  const [pathPart, query] = url.split("?");
  const path = pathPart.replace(/^\/api\/uploads\//, "");
  const params = new URLSearchParams(query);
  return { path, exp: params.get("exp")!, sig: params.get("sig")! };
}

describe("signAttachmentUrl / verifyAttachmentToken", () => {
  it("a validly-signed token verifies successfully", () => {
    const attachmentPath = "ticket123/abc-def.png";
    const url = signAttachmentUrl(attachmentPath);
    const { path, exp, sig } = parseSignedUrl(url);
    expect(path).toBe(attachmentPath);
    expect(verifyAttachmentToken(attachmentPath, exp, sig)).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const attachmentPath = "ticket123/abc-def.png";
    const url = signAttachmentUrl(attachmentPath);
    const { exp, sig } = parseSignedUrl(url);
    const tamperedSig = sig.slice(0, -1) + (sig.at(-1) === "0" ? "1" : "0");
    expect(verifyAttachmentToken(attachmentPath, exp, tamperedSig)).toBe(false);
  });

  it("rejects a token whose signature was forged with a different string entirely", () => {
    const attachmentPath = "ticket123/abc-def.png";
    const { exp } = parseSignedUrl(signAttachmentUrl(attachmentPath));
    expect(verifyAttachmentToken(attachmentPath, exp, "0".repeat(64))).toBe(false);
  });

  it("rejects a missing exp or sig", () => {
    expect(verifyAttachmentToken("a/b.png", null, "sig")).toBe(false);
    expect(verifyAttachmentToken("a/b.png", "12345", null)).toBe(false);
    expect(verifyAttachmentToken("a/b.png", null, null)).toBe(false);
  });

  it("rejects a non-numeric exp", () => {
    expect(verifyAttachmentToken("a/b.png", "not-a-number", "0".repeat(64))).toBe(false);
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 0));
      const attachmentPath = "ticket123/abc-def.png";
      const url = signAttachmentUrl(attachmentPath);
      const { exp, sig } = parseSignedUrl(url);

      // Still valid right before expiry (TTL is 1 hour).
      vi.setSystemTime(new Date(2024, 0, 1, 0, 59, 59));
      expect(verifyAttachmentToken(attachmentPath, exp, sig)).toBe(true);

      // Past expiry.
      vi.setSystemTime(new Date(2024, 0, 1, 1, 0, 1));
      expect(verifyAttachmentToken(attachmentPath, exp, sig)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  // The exact class of bug hand-caught during manual testing earlier in
  // this project: a token signed for one attachment path must NOT verify
  // against a different path, even with a technically-valid exp/sig pair.
  it("a token signed for one attachment path does NOT verify against a different path", () => {
    const pathA = "ticketA/file1.png";
    const pathB = "ticketB/file2.png";
    const url = signAttachmentUrl(pathA);
    const { exp, sig } = parseSignedUrl(url);

    expect(verifyAttachmentToken(pathA, exp, sig)).toBe(true);
    expect(verifyAttachmentToken(pathB, exp, sig)).toBe(false);
  });

  it("rejects the same token verified against a sibling file in the same ticket folder", () => {
    const pathA = "ticket123/abc-def.png";
    const pathSibling = "ticket123/other-file.png";
    const { exp, sig } = parseSignedUrl(signAttachmentUrl(pathA));
    expect(verifyAttachmentToken(pathSibling, exp, sig)).toBe(false);
  });
});
