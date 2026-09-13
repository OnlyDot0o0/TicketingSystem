import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, GMAIL_RELAY_WEBHOOK_URL, GMAIL_RELAY_SECRET } =
  process.env;

const isSmtpConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
// Free, no-domain-needed alternative to SMTP: a small Google Apps Script
// deployed as a web app, running under a real Gmail account, that calls
// GmailApp.sendEmail() — genuinely the same as sending mail from that
// account manually, so there's no "sandbox mode"/single-recipient
// restriction the way most free transactional-email providers impose
// (Resend, SendGrid, etc. all gate multi-recipient sending behind a
// verified custom domain). Takes priority over SMTP when both are set,
// since this is the one that actually solves "send to any real recipient
// for $0" — see README.md's "Email" section for the Apps Script source and
// setup steps.
const isGmailRelayConfigured = Boolean(GMAIL_RELAY_WEBHOOK_URL);

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (!isSmtpConfigured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

async function sendViaGmailRelay(opts: { to: string; subject: string; html: string; text?: string }) {
  const res = await fetch(GMAIL_RELAY_WEBHOOK_URL as string, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // The Apps Script web app URL is unguessable but not otherwise access-
    // controlled (it has to accept unauthenticated POSTs from this server,
    // since Google's own auth doesn't apply to a server-to-server call) —
    // the shared secret is the actual access control, checked inside the
    // script before it ever calls GmailApp.sendEmail().
    body: JSON.stringify({ secret: GMAIL_RELAY_SECRET || "", to: opts.to, subject: opts.subject, html: opts.html, text: opts.text }),
  });

  // Apps Script's /exec endpoint always 302-redirects a POST to a signed
  // script.googleusercontent.com URL that serves the actual {ok:true}/
  // {ok:false,error} JSON body. By the time that redirect is issued, doPost()
  // — and therefore GmailApp.sendEmail() — has ALREADY run, so the email
  // send itself doesn't depend on successfully following it. Confirmed live:
  // real test emails arrived every time even on requests where following
  // that redirect 404'd (an intermittent issue on Google's side, unrelated
  // to whether the mail sent). So only a failure to reach script.google.com
  // at all (fetch() throwing, caught by sendMail's caller) is treated as a
  // real failure; a bad response after the redirect is logged, not thrown.
  if (!res.ok) {
    console.warn(
      `[mail:warn] Gmail relay follow-up request returned ${res.status} ${res.statusText} — the send itself very likely still succeeded (see src/lib/mail.ts comment).`
    );
    return;
  }
  const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (body?.ok === false) {
    // A real, meaningful rejection from inside the script (e.g. bad secret) —
    // this only surfaces on the requests where the redirect follow-up itself
    // succeeded, but that's still enough to catch a persistently misconfigured
    // secret rather than silently swallowing it forever.
    throw new Error(`Gmail relay rejected the request: ${body.error}`);
  }
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  if (isGmailRelayConfigured) {
    try {
      await sendViaGmailRelay(opts);
      return { skipped: false };
    } catch (err) {
      console.error("[mail:error]", err);
      return { skipped: true, error: true };
    }
  }

  const t = getTransporter();
  if (!t) {
    // Graceful no-op: no mail transport configured yet. Log so devs can see
    // intent. If the caller passed a plain-text body (e.g. a password-reset
    // link), print it too so local/dev testing can follow the link straight
    // from the console without needing real SMTP.
    console.log(
      `[mail:no-op] No mail transport configured — would have sent "${opts.subject}" to ${opts.to}` +
        (opts.text ? `\n[mail:no-op] body:\n${opts.text}` : "")
    );
    return { skipped: true };
  }
  try {
    await t.sendMail({
      from: SMTP_FROM || "Helpdesk <no-reply@helpdesk.local>",
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    return { skipped: false };
  } catch (err) {
    console.error("[mail:error]", err);
    return { skipped: true, error: true };
  }
}

export function emailShell(bodyHtml: string, projectName: string) {
  // Without a viewport meta tag, mobile mail clients that don't do their own
  // reflow (notably iOS/macOS Mail) render HTML email at a virtual desktop
  // width (~980px) and scale the whole thing down to fit the screen — every
  // tap target (e.g. notifyResolved's CSAT star links below) shrinks along
  // with it. Most of this app's ticket submitters are on phones, so this
  // matters here more than it would for a typically desktop-read app.
  return `<!doctype html>
<html dir="rtl" lang="ar">
  <head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
  <body style="font-family: Tahoma, Arial, sans-serif; background:#F2F4F1; padding:24px; color:#16221F;">
    <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #D3DBD4;border-radius:12px;padding:24px;">
      <div style="color:#276661;font-weight:bold;font-size:18px;margin-bottom:16px;">${projectName} مساعدة الدعم الفني</div>
      ${bodyHtml}
    </div>
  </body>
</html>`;
}
