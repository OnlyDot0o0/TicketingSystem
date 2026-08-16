import crypto from "crypto";
import { prisma } from "./prisma";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

// Creates a fresh reset token for a user and returns the RAW token (only
// ever held in memory / emailed — never stored). The DB only ever stores
// the SHA-256 hash, with an expiry and single-use enforcement (usedAt).
export async function createPasswordResetToken(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await prisma.passwordResetToken.create({
    data: { userId, tokenHash, expiresAt },
  });

  return rawToken;
}

export type ResetTokenLookupResult =
  | { valid: true; userId: string; tokenId: string }
  | { valid: false; reason: "not_found" | "expired" | "used" };

export async function lookupPasswordResetToken(rawToken: string): Promise<ResetTokenLookupResult> {
  const tokenHash = hashToken(rawToken);
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!row) return { valid: false, reason: "not_found" };
  if (row.usedAt) return { valid: false, reason: "used" };
  if (row.expiresAt.getTime() < Date.now()) return { valid: false, reason: "expired" };
  return { valid: true, userId: row.userId, tokenId: row.id };
}

export async function consumePasswordResetToken(tokenId: string): Promise<void> {
  await prisma.passwordResetToken.update({
    where: { id: tokenId },
    data: { usedAt: new Date() },
  });
}
