"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateTotpSecret, totpKeyUri, totpQrCodeDataUrl, verifyTotpCode } from "@/lib/totp";
import { revalidatePath } from "next/cache";

export type GenerateTotpResult = { error?: string; secret?: string; qrDataUrl?: string };
export type ConfirmTotpResult = { error?: string; success?: boolean };
export type DisableTotpResult = { error?: string; success?: boolean };

// Step 1 of self-service enrollment: generate a fresh secret and save it
// immediately (totpEnabled stays false until confirmTotpEnrollmentAction
// proves the user actually scanned it — see prisma/schema.prisma for why
// storing the raw secret pre-confirmation is fine, same as post-
// confirmation). Re-generating discards any previous unconfirmed secret,
// same as clicking "start over".
export async function generateTotpSecretAction(): Promise<GenerateTotpResult> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح." };

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpSecret: secret, totpEnabled: false },
  });

  const uri = totpKeyUri(session.user.email || session.user.id, secret);
  const qrDataUrl = await totpQrCodeDataUrl(uri);

  return { secret, qrDataUrl };
}

// Step 2: proves the user actually scanned the QR code (or copied the
// manual-entry secret into their authenticator app) before 2FA is actually
// turned on for their account.
export async function confirmTotpEnrollmentAction(code: string): Promise<ConfirmTotpResult> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح." };

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.totpSecret) return { error: "يرجى إنشاء رمز سري أولًا." };

  const valid = await verifyTotpCode(user.totpSecret, code);
  if (!valid) return { error: "رمز التحقق غير صحيح أو منتهي الصلاحية." };

  await prisma.user.update({ where: { id: session.user.id }, data: { totpEnabled: true } });
  revalidatePath("/dashboard/settings");
  return { success: true };
}

// Disabling requires the CURRENT password, not just a button click —
// turning 2FA off weakens the account, so it needs a stronger
// confirmation than a plain "are you sure?" dialog.
export async function disableTotpAction(currentPassword: string): Promise<DisableTotpResult> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح." };

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { error: "غير مصرح." };

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { error: "كلمة المرور الحالية غير صحيحة." };

  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpEnabled: false, totpSecret: null },
  });

  revalidatePath("/dashboard/settings");
  return { success: true };
}
