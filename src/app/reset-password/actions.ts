"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { lookupPasswordResetToken, consumePasswordResetToken } from "@/lib/passwordReset";

export type ResetPasswordState = { error?: string; success?: boolean };

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const token = String(formData.get("token") || "").trim();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!token) return { error: "رابط غير صالح." };
  if (!password || password.length < 8) return { error: "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل." };
  if (password !== confirmPassword) return { error: "كلمتا المرور غير متطابقتين." };

  const lookup = await lookupPasswordResetToken(token);
  if (!lookup.valid) {
    if (lookup.reason === "expired") return { error: "انتهت صلاحية رابط إعادة التعيين. يرجى طلب رابط جديد." };
    if (lookup.reason === "used") return { error: "تم استخدام هذا الرابط مسبقًا. يرجى طلب رابط جديد." };
    return { error: "رابط غير صالح." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id: lookup.userId }, data: { passwordHash } });
  await consumePasswordResetToken(lookup.tokenId);

  return { success: true };
}
