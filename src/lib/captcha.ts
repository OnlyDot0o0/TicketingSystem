// Optional CAPTCHA support (hCaptcha or reCAPTCHA v2) for the public ticket
// form. Fully optional, same graceful-degradation pattern as SMTP in
// src/lib/mail.ts: if the relevant env vars aren't set, the widget is never
// rendered and server-side verification is skipped entirely — submission is
// never blocked just because no real keys are configured yet.
//
// Env vars (set whichever ONE provider you want to use):
//   HCAPTCHA_SITE_KEY / HCAPTCHA_SECRET_KEY
//   RECAPTCHA_SITE_KEY / RECAPTCHA_SECRET_KEY
// If both are set, hCaptcha takes precedence.

export type CaptchaConfig =
  | { provider: "hcaptcha"; siteKey: string }
  | { provider: "recaptcha"; siteKey: string }
  | null;

export function getCaptchaConfig(): CaptchaConfig {
  const hSite = process.env.HCAPTCHA_SITE_KEY;
  const hSecret = process.env.HCAPTCHA_SECRET_KEY;
  if (hSite && hSecret) return { provider: "hcaptcha", siteKey: hSite };

  const rSite = process.env.RECAPTCHA_SITE_KEY;
  const rSecret = process.env.RECAPTCHA_SECRET_KEY;
  if (rSite && rSecret) return { provider: "recaptcha", siteKey: rSite };

  return null;
}

export function isCaptchaConfigured(): boolean {
  return getCaptchaConfig() !== null;
}

// Verifies the submitted token server-side. Returns true when captcha isn't
// configured at all (nothing to verify against) — callers should only treat
// a `false` return as a hard rejection.
export async function verifyCaptcha(token: string | null): Promise<boolean> {
  const hSecret = process.env.HCAPTCHA_SECRET_KEY;
  const hSite = process.env.HCAPTCHA_SITE_KEY;
  const rSecret = process.env.RECAPTCHA_SECRET_KEY;
  const rSite = process.env.RECAPTCHA_SITE_KEY;

  const useHcaptcha = Boolean(hSite && hSecret);
  const useRecaptcha = !useHcaptcha && Boolean(rSite && rSecret);

  if (!useHcaptcha && !useRecaptcha) return true; // not configured — skip

  if (!token) return false;

  try {
    if (useHcaptcha) {
      const res = await fetch("https://hcaptcha.com/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: hSecret as string, response: token }),
      });
      const data = (await res.json()) as { success?: boolean };
      return Boolean(data.success);
    }
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: rSecret as string, response: token }),
    });
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch (err) {
    console.error("[captcha:verify]", err);
    // Fail closed on a verification error when captcha IS configured.
    return false;
  }
}
