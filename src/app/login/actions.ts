"use server";

import { headers } from "next/headers";
import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { checkRateLimit, ONE_HOUR_MS } from "@/lib/rateLimit";

export type LoginState = { error?: string };

// Login had no brute-force protection at all — unlike the public ticket
// form, which already has rate limiting for exactly this reason. Keyed by
// email+IP together so one bad actor guessing many emails from one IP is
// still throttled, without a shared office IP locking out everyone over a
// single user's typos.
const LOGIN_ATTEMPTS_PER_WINDOW = 10;

function clientIp(): string {
  const h = headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") || "unknown";
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const callbackUrl = String(formData.get("callbackUrl") || "/dashboard");

  const rateLimitKey = `login:${email.trim().toLowerCase()}:${clientIp()}`;
  if (!checkRateLimit(rateLimitKey, LOGIN_ATTEMPTS_PER_WINDOW, ONE_HOUR_MS)) {
    return { error: "تم تجاوز عدد محاولات الدخول المسموح. يرجى المحاولة لاحقًا." };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: callbackUrl,
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." };
    }
    throw err;
  }
}
