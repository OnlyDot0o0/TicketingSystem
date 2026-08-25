"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth, unstable_update } from "@/lib/auth";

export type ChangePasswordState = { error?: string; success?: boolean };

// Forced first-login password change (see createAgentAction /
// src/middleware.ts). Deliberately does NOT ask for the current password —
// the account holder only knows the one-time temp password an admin told
// them out-of-band, so there's nothing meaningful to confirm beyond who
// they're signed in as. Only usable while mustChangePassword is still set;
// this is not a general "change my password" endpoint.
export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح." };
  if (!session.user.mustChangePassword) return { error: "لا حاجة لتغيير كلمة المرور." };

  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!password || password.length < 8) return { error: "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل." };
  if (password !== confirmPassword) return { error: "كلمتا المرور غير متطابقتين." };

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash, mustChangePassword: false },
  });

  // Refresh the session JWT's mustChangePassword claim in place — without
  // this, src/middleware.ts would keep bouncing the user back here on a
  // stale token until it naturally re-issues on a future sign-in.
  await unstable_update({ user: { mustChangePassword: false } });

  return { success: true };
}
