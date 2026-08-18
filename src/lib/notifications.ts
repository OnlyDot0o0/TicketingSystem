import { prisma } from "./prisma";
import { sendMail, emailShell } from "./mail";
import { APP_BASE_URL } from "./config";

type ProjectRef = { slug: string; name: string };

export async function notifyTicketCreated(
  ticket: {
    ticketNumber: string;
    subject: string;
    submitterEmail: string | null;
    // Already-resolved display label (categories are per-project now — the
    // caller resolves the key against that project's own Category list
    // before calling this, since this function has no project id to look
    // it up with itself for the submitter-facing email).
    categoryLabel: string;
  },
  // Needs `id` (unlike the other notify* functions below) to scope the
  // staff notification list to this project's actual members.
  project: ProjectRef & { id: string }
) {
  const trackUrl = `${APP_BASE_URL}/${project.slug}/tickets/track`;

  if (ticket.submitterEmail) {
    await sendMail({
      to: ticket.submitterEmail,
      subject: `تم استلام تذكرتك رقم ${ticket.ticketNumber}`,
      html: emailShell(
        `
        <p>شكرًا لتواصلك معنا. تم فتح تذكرة دعم لمشروع ${project.name}:</p>
        <p style="font-size:20px;font-weight:bold;color:#B5691A;">${ticket.ticketNumber}</p>
        <p><strong>الموضوع:</strong> ${ticket.subject}</p>
        <p><strong>التصنيف:</strong> ${ticket.categoryLabel}</p>
        <p>يمكنك متابعة حالة التذكرة في أي وقت عبر الرابط التالي، باستخدام رقم التذكرة ورقم جوالك:</p>
        <p><a href="${trackUrl}" style="color:#276661;">${trackUrl}</a></p>
      `,
        project.name
      ),
    });
  }

  // Notify only staff who can actually SEE this project: SUPER_ADMIN
  // (always global) plus anyone (ADMIN/AGENT/CUSTOM role, doesn't matter
  // which) with a ProjectMembership row for it. Notifying every active
  // staff member platform-wide — the original single-tenant behavior —
  // would spam unrelated teams about projects they have no access to once
  // there are more than a couple of projects, and it silently excluded
  // CUSTOM-role users (the `role: { in: [...] }` filter never matched
  // "CUSTOM"), so a custom-role agent would never hear about a new ticket
  // even in their own project.
  const staff = await prisma.user.findMany({
    where: {
      active: true,
      OR: [{ role: "SUPER_ADMIN" }, { memberships: { some: { projectId: project.id } } }],
    },
    select: { email: true },
  });
  await Promise.all(
    staff.map((u) =>
      sendMail({
        to: u.email,
        subject: `تذكرة جديدة (${project.name}): ${ticket.ticketNumber}`,
        html: emailShell(
          `
          <p>تم فتح تذكرة دعم جديدة لمشروع ${project.name} تحتاج للمراجعة:</p>
          <p style="font-size:20px;font-weight:bold;color:#B5691A;">${ticket.ticketNumber}</p>
          <p><strong>الموضوع:</strong> ${ticket.subject}</p>
          <p><a href="${APP_BASE_URL}/dashboard" style="color:#276661;">فتح لوحة التحكم</a></p>
        `,
          project.name
        ),
      })
    )
  );
}

export async function notifyAgentReply(
  ticket: { ticketNumber: string; submitterEmail: string | null },
  project: ProjectRef
) {
  if (!ticket.submitterEmail) return;
  const trackUrl = `${APP_BASE_URL}/${project.slug}/tickets/track`;
  await sendMail({
    to: ticket.submitterEmail,
    subject: `رد جديد على تذكرتك ${ticket.ticketNumber}`,
    html: emailShell(
      `
      <p>يوجد رد جديد من فريق دعم ${project.name} على تذكرتك:</p>
      <p style="font-size:20px;font-weight:bold;color:#B5691A;">${ticket.ticketNumber}</p>
      <p>يرجى الدخول لصفحة تتبع التذكرة للاطلاع على الرد والتفاعل معه.</p>
      <p><a href="${trackUrl}" style="color:#276661;">تتبع التذكرة</a></p>
    `,
      project.name
    ),
  });
}

export async function notifyResolved(
  // `id` (unlike the other notify* functions above) so we can build the
  // public one-click CSAT rating links (/csat/[ticketId]?rating=N). Ticket
  // ids are unguessable cuids and this is a low-stakes action — same trust
  // model this app already uses for attachment URLs (src/app/api/uploads),
  // so no separate token was added just for this.
  ticket: { id: string; ticketNumber: string; submitterEmail: string | null },
  project: ProjectRef
) {
  if (!ticket.submitterEmail) return;
  const trackUrl = `${APP_BASE_URL}/${project.slug}/tickets/track`;
  const csatBaseUrl = `${APP_BASE_URL}/csat/${ticket.id}`;
  const ratingLinks = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<a href="${csatBaseUrl}?rating=${n}" style="display:inline-block;margin:2px 4px;padding:6px 10px;border:1px solid #D3DBD4;border-radius:8px;color:#276661;text-decoration:none;font-size:16px;white-space:nowrap;">${"⭐".repeat(n)}</a>`
    )
    .join("");
  await sendMail({
    to: ticket.submitterEmail,
    subject: `تم حل تذكرتك ${ticket.ticketNumber}`,
    html: emailShell(
      `
      <p>تم تحديد تذكرتك التالية لمشروع ${project.name} على أنها "تم الحل":</p>
      <p style="font-size:20px;font-weight:bold;color:#B5691A;">${ticket.ticketNumber}</p>
      <p>إذا كانت المشكلة قد حُلّت فعلاً، لا حاجة لأي إجراء. أما إذا كانت المشكلة ما زالت قائمة، يرجى الدخول لصفحة تتبع التذكرة وإضافة رد لإعادة فتحها.</p>
      <p><a href="${trackUrl}" style="color:#276661;">تتبع التذكرة</a></p>
      <p style="margin-top:20px;">ما مدى رضاك عن الحل المقدم؟ اختر تقييمًا بضغطة واحدة:</p>
      <p>${ratingLinks}</p>
    `,
      project.name
    ),
    // Same pattern as the forgot-password email (src/app/forgot-password/actions.ts):
    // a plain-text fallback so the important links are actually visible in
    // the no-SMTP console-log path, not just buried in an HTML body that
    // never gets printed.
    text: `تم حل تذكرتك ${ticket.ticketNumber}. تتبع التذكرة: ${trackUrl}\nقيّم رضاك عن الحل (1-5): ${[1, 2, 3, 4, 5]
      .map((n) => `${n}=${csatBaseUrl}?rating=${n}`)
      .join(" | ")}`,
  });
}
