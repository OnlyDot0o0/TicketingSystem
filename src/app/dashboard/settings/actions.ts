"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth, unstable_update } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type AccountInfoState = { error?: string; success?: boolean };

// Self-service account info edit (name/email) — reachable from the same
// "any logged-in staff account" scope as the rest of this page. Requires
// the CURRENT password: this changes the account's login identity (email
// doubles as the Credentials username), so a plain "are you sure?" isn't
// enough confirmation.
export async function updateAccountInfoAction(
  _prev: AccountInfoState,
  formData: FormData
): Promise<AccountInfoState> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح." };

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const currentPassword = String(formData.get("currentPassword") || "");

  if (!name) return { error: "يرجى إدخال الاسم." };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "يرجى إدخال بريد إلكتروني صالح." };
  if (!currentPassword) return { error: "يرجى إدخال كلمة المرور الحالية لتأكيد التغيير." };

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { error: "غير مصرح." };

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { error: "كلمة المرور الحالية غير صحيحة." };

  if (email !== user.email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return { error: "يوجد مستخدم آخر يستخدم هذا البريد الإلكتروني بالفعل." };
  }

  await prisma.user.update({ where: { id: user.id }, data: { name, email } });

  // Refresh the session JWT's name/email in place — see the matching
  // comment in src/lib/auth.ts's jwt() callback — so the change is visible
  // immediately (nav header, "أنت" labels, etc.) without signing out and
  // back in. Necessary in particular for email: the NEXT login must use
  // the new address, but THIS session should keep working uninterrupted.
  await unstable_update({ user: { name, email } });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard", "layout");
  return { success: true };
}

export type ChangeOwnPasswordState = { error?: string; success?: boolean };

// Self-service "change my password while already logged in" — distinct
// from src/app/dashboard/change-password/actions.ts's changePasswordAction,
// which is a ONE-TIME forced flow for admin-created accounts and explicitly
// refuses to run once mustChangePassword is already false (see that file's
// own comment). This one is the opposite: it always requires the CURRENT
// password (there is one to check, unlike the forced first-login case)
// and works for any already-active account at any time.
export async function changeOwnPasswordAction(
  _prev: ChangeOwnPasswordState,
  formData: FormData
): Promise<ChangeOwnPasswordState> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح." };

  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!currentPassword) return { error: "يرجى إدخال كلمة المرور الحالية." };
  if (!newPassword || newPassword.length < 8) return { error: "يجب أن تتكون كلمة المرور الجديدة من 8 أحرف على الأقل." };
  if (newPassword !== confirmPassword) return { error: "كلمتا المرور الجديدتان غير متطابقتين." };

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { error: "غير مصرح." };

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { error: "كلمة المرور الحالية غير صحيحة." };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return { success: true };
}
