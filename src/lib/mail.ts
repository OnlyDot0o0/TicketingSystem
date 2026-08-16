import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

const isConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (!isConfigured) return null;
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

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const t = getTransporter();
  if (!t) {
    // Graceful no-op: SMTP not configured yet. Log so devs can see intent.
    // If the caller passed a plain-text body (e.g. a password-reset link),
    // print it too so local/dev testing can follow the link straight from
    // the console without needing real SMTP.
    console.log(
      `[mail:no-op] SMTP not configured — would have sent "${opts.subject}" to ${opts.to}` +
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
  return `<!doctype html>
<html dir="rtl" lang="ar">
  <body style="font-family: Tahoma, Arial, sans-serif; background:#F2F4F1; padding:24px; color:#16221F;">
    <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #D3DBD4;border-radius:12px;padding:24px;">
      <div style="color:#276661;font-weight:bold;font-size:18px;margin-bottom:16px;">${projectName} مساعدة الدعم الفني</div>
      ${bodyHtml}
    </div>
  </body>
</html>`;
}
