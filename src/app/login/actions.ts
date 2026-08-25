"use server";

import { headers } from "next/headers";
import { signIn } from "@/lib/auth";
import { AuthError, CredentialsSignin } from "next-auth";
import { checkRateLimit, ONE_HOUR_MS } from "@/lib/rateLimit";

// needsTotp: password verified, account has 2FA enabled, no (or an
// invalid) code submitted yet — the form should reveal the code field and
// resubmit with the same email/password plus the code, instead of erroring
// out like a wrong password would.
export type LoginState = { error?: string; needsTotp?: boolean };

// Login had no brute-force protection at all — unlike the public ticket
// form, which already has rate limiting for exactly this reason. Keyed by
// email+IP together so one bad actor guessing many emails from one IP is
// still throttled, without a shared office IP locking out everyone over a
// single user's typos.
const LOGIN_ATTEMPTS_PER_WINDOW = 10;

// A 6-digit TOTP code is brute-forceable without this — same key shape as
// the login limiter above, just a separate bucket/counter so a burst of
// code guesses doesn't also lock the account out of the password step.
const TOTP_ATTEMPTS_PER_WINDOW = 10;

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
  const totpCode = String(formData.get("totpCode") || "").trim();
  const callbackUrl = String(formData.get("callbackUrl") || "/dashboard");

  const rateLimitKey = `login:${email.trim().toLowerCase()}:${clientIp()}`;
  if (!(await checkRateLimit(rateLimitKey, LOGIN_ATTEMPTS_PER_WINDOW, ONE_HOUR_MS))) {
    return { error: "تم تجاوز عدد محاولات الدخول المسموح. يرجى المحاولة لاحقًا." };
  }

  // Only count actual code guesses against the TOTP limiter — the first,
  // password-only submission that reveals "a code is needed" isn't a guess.
  if (totpCode) {
    const totpRateLimitKey = `totp:${email.trim().toLowerCase()}:${clientIp()}`;
    if (!(await checkRateLimit(totpRateLimitKey, TOTP_ATTEMPTS_PER_WINDOW, ONE_HOUR_MS))) {
      return { needsTotp: true, error: "تم تجاوز عدد محاولات إدخال رمز التحقق. يرجى المحاولة لاحقًا." };
    }
  }

  try {
    await signIn("credentials", {
      email,
      password,
      totpCode,
      redirectTo: callbackUrl,
    });
    return {};
  } catch (err) {
    if (err instanceof CredentialsSignin) {
      if (err.code === "totp_required") return { needsTotp: true };
      if (err.code === "totp_invalid") {
        return { needsTotp: true, error: "رمز التحقق غير صحيح أو منتهي الصلاحية." };
      }
    }
    if (err instanceof AuthError) {
      return { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." };
    }
    throw err;
  }
}
