// Self-service TOTP 2FA (v5) — a thin wrapper around otplib's functional
// API + qrcode, kept in one place so the enrollment/disable UI
// (src/app/dashboard/settings) and the login authorize() callback
// (src/lib/auth.ts) verify codes exactly the same way.
//
// otplib does all the RFC 6238 math; qrcode only renders the otpauth://
// URI as a scannable PNG data URI (no external service — everything runs
// server-side). "RAQABA+ Helpdesk" is used as the issuer label so an
// account is distinguishable in an authenticator app's list.

import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";

const ISSUER = "RAQABA+ Helpdesk";

// Allow +/-1 time step (+/-30s) of clock drift between the server and the
// user's device/authenticator app — the same real-world tolerance every
// TOTP integration needs. Without it, a code typed a second too late (or a
// clock a few seconds off) would be rejected even though it's the exact
// code the app is currently showing.
const EPOCH_TOLERANCE_SECONDS = 30;

export function generateTotpSecret(): string {
  return generateSecret();
}

export function totpKeyUri(email: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label: email, secret });
}

export async function totpQrCodeDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri);
}

export async function verifyTotpCode(secret: string, token: string): Promise<boolean> {
  if (!/^\d{6}$/.test(token.trim())) return false;
  const result = await verify({ secret, token: token.trim(), epochTolerance: EPOCH_TOLERANCE_SECONDS });
  return result.valid;
}
