import crypto from "crypto";

// Attachment downloads (/api/uploads/[...path]) previously had NO access
// control at all beyond an unguessable URL (ticketId cuid + random UUID
// filename) — anyone who ever learned a URL (browser history, a shared
// screenshot, a referrer header) could fetch it forever, including staff
// from an unrelated project. That's a real gap once this app hosts many
// projects' worth of tickets, not just one team's.
//
// Two legitimate access patterns exist:
//  1. An authenticated staff session with project access — checked
//     directly in the route via getViewerScope()/canAccessProject(), same
//     as every other authorization check in this app.
//  2. An anonymous submitter viewing their OWN ticket's attachments via
//     the public /{slug}/tickets/track page, which has no persistent
//     session — they only ever prove identity by ticketNumber+phone, once
//     per page load. For that flow, the page generates a short-lived
//     HMAC-signed URL (reusing NEXTAUTH_SECRET, same trust root as
//     session cookies) at render time — a leaked link stops working once
//     it expires, unlike the old permanent-by-construction URLs.

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour — matches the password-reset token TTL convention elsewhere in this app

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET is not set — required to sign attachment access tokens.");
  return s;
}

function sign(path: string, exp: number): string {
  return crypto.createHmac("sha256", secret()).update(`${path}:${exp}`).digest("hex");
}

// Returns a full URL path (relative, starts with /api/uploads/) good for
// TOKEN_TTL_MS from now. `attachmentPath` is the Attachment.path value
// (e.g. "<ticketId>/<uuid>.jpg").
export function signAttachmentUrl(attachmentPath: string): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const sig = sign(attachmentPath, exp);
  return `/api/uploads/${attachmentPath}?exp=${exp}&sig=${sig}`;
}

export function verifyAttachmentToken(attachmentPath: string, expRaw: string | null, sigRaw: string | null): boolean {
  if (!expRaw || !sigRaw) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  const expected = sign(attachmentPath, exp);
  const expectedBuf = Buffer.from(expected, "hex");
  const givenBuf = Buffer.from(sigRaw, "hex");
  if (expectedBuf.length !== givenBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, givenBuf);
}
