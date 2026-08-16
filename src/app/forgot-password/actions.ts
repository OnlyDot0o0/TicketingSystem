"use server";

import { prisma } from "@/lib/prisma";
import { createPasswordResetToken } from "@/lib/passwordReset";
import { sendMail, emailShell } from "@/lib/mail";
import { APP_BASE_URL } from "@/lib/config";

export type ForgotPasswordState = { submitted?: boolean; error?: string };

export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) return { error: "يرجى إدخال البريد الإلكتروني." };

  const user = await prisma.user.findUnique({ where: { email } });

  // Always return the same generic "submitted" response regardless of
  // whether the account exists/active, to avoid leaking which emails have
  // accounts (user enumeration).
  if (user && user.active) {
    const rawToken = await createPasswordResetToken(user.id);
    const resetUrl = `${APP_BASE_URL}/reset-password?token=${rawToken}`;
    await sendMail({
      to: user.email,
      subject: "طلب إعادة تعيين كلمة المرور",
      html: emailShell(
        `
        <p>وصلنا طلب لإعادة تعيين كلمة مرور حسابك في مساعدة الدعم الفني.</p>
        <p>إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة بأمان.</p>
        <p>الرابط صالح لمدة ساعة واحدة فقط ولمرة واحدة:</p>
        <p><a href="${resetUrl}" style="color:#276661;">${resetUrl}</a></p>
      `,
        "مساعدة الدعم الفني"
      ),
      text: `رابط إعادة تعيين كلمة المرور (صالح لمدة ساعة واحدة): ${resetUrl}`,
    });
  }

  return { submitted: true };
}
