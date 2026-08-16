"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { generateTicketNumber } from "@/lib/ticketNumber";
import { computeSlaDueAt, PriorityLevel } from "@/lib/sla";
import { saveUploadedFile, assertValidUpload, UploadValidationError } from "@/lib/upload";
import { notifyTicketCreated } from "@/lib/notifications";
import { checkRateLimit, TICKET_RATE_LIMIT_PER_PHONE, TICKET_RATE_LIMIT_PER_IP, ONE_HOUR_MS } from "@/lib/rateLimit";
import { verifyCaptcha } from "@/lib/captcha";
import { validateCustomFieldValue } from "@/lib/customFields";
import { redirect } from "next/navigation";

export type CreateTicketState = {
  error?: string;
};

const CATEGORIES = [
  "LOGIN_CONNECTIVITY",
  "ROUTES_PATROLS",
  "RECORDS_DATES",
  "PHOTOS_ATTACHMENTS",
  "PERFORMANCE",
  "OTHER",
];
const PRIORITIES: PriorityLevel[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const DEFAULT_CATEGORY = "OTHER";
const DEFAULT_PRIORITY: PriorityLevel = "MEDIUM";

function clientIp(): string {
  const h = headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") || "unknown";
}

export async function createTicketAction(
  slug: string,
  _prevState: CreateTicketState,
  formData: FormData
): Promise<CreateTicketState> {
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) {
    return { error: "المشروع غير موجود." };
  }

  // --- Honeypot: a real user never fills this hidden field. Bots that
  // blindly autofill every form field usually do. Reject silently — no
  // error message, no ticket, so the bot gets no useful signal back.
  const honeypot = String(formData.get("website") || "").trim();
  if (honeypot) {
    console.warn(`[ticket:honeypot] rejected submission for project=${slug}`);
    return {};
  }

  const submitterName = String(formData.get("submitterName") || "").trim();
  const submitterPhone = String(formData.get("submitterPhone") || "").trim();
  let submitterEmail = String(formData.get("submitterEmail") || "").trim() || null;
  let contractNumber = String(formData.get("contractNumber") || "").trim() || null;
  let categoryRaw = String(formData.get("category") || "").trim();
  let priorityRaw = String(formData.get("priority") || "").trim();
  const subject = String(formData.get("subject") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const captchaToken = String(formData.get("captchaToken") || formData.get("h-captcha-response") || formData.get("g-recaptcha-response") || "") || null;

  // Name, phone, subject, description are always required — not configurable.
  if (!submitterName || !submitterPhone || !subject || !description) {
    return { error: "يرجى تعبئة جميع الحقول المطلوبة." };
  }

  // --- Rate limiting (in-memory, single-instance — see src/lib/rateLimit.ts).
  const ip = clientIp();
  if (!checkRateLimit(`phone:${submitterPhone}`, TICKET_RATE_LIMIT_PER_PHONE, ONE_HOUR_MS)) {
    return { error: "تم تجاوز الحد المسموح لعدد التذاكر من نفس رقم الجوال. يرجى المحاولة لاحقًا." };
  }
  if (!checkRateLimit(`ip:${ip}`, TICKET_RATE_LIMIT_PER_IP, ONE_HOUR_MS)) {
    return { error: "تم تجاوز الحد المسموح لعدد التذاكر من هذا الاتصال. يرجى المحاولة لاحقًا." };
  }

  // --- Optional CAPTCHA (skipped entirely if not configured — see src/lib/captcha.ts).
  const captchaOk = await verifyCaptcha(captchaToken);
  if (!captchaOk) {
    return { error: "يرجى إثبات أنك لست روبوتًا (فشل التحقق الأمني)." };
  }

  // --- Server-side enforcement of the project's ticket-form field config.
  // Never trust client-only hide/require — re-check every field mode here.
  if (project.emailMode === "HIDDEN") submitterEmail = null;
  else if (project.emailMode === "REQUIRED" && !submitterEmail) {
    return { error: "البريد الإلكتروني مطلوب لهذا المشروع." };
  }

  if (project.contractNumberMode === "HIDDEN") contractNumber = null;
  else if (project.contractNumberMode === "REQUIRED" && !contractNumber) {
    return { error: "رقم العقد مطلوب لهذا المشروع." };
  }

  // category/priority: REQUIRED or OPTIONAL only. If OPTIONAL and left
  // blank (or invalid), fall back to a sensible default server-side.
  if (project.categoryMode === "REQUIRED" && !categoryRaw) {
    return { error: "يرجى اختيار تصنيف المشكلة." };
  }
  if (categoryRaw && !CATEGORIES.includes(categoryRaw)) {
    return { error: "تصنيف غير صالح." };
  }
  const category = categoryRaw || DEFAULT_CATEGORY;

  if (project.priorityMode === "REQUIRED" && !priorityRaw) {
    return { error: "يرجى اختيار أولوية المشكلة." };
  }
  if (priorityRaw && !PRIORITIES.includes(priorityRaw as PriorityLevel)) {
    return { error: "أولوية غير صالحة." };
  }
  const priority = (priorityRaw || DEFAULT_PRIORITY) as PriorityLevel;

  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);
  if (project.attachmentsMode === "HIDDEN" && files.length > 0) {
    return { error: "المرفقات غير متاحة لهذا المشروع." };
  }
  if (project.attachmentsMode === "REQUIRED" && files.length === 0) {
    return { error: "يرجى إرفاق ملف واحد على الأقل." };
  }

  // --- Server-side re-validation of this project's custom fields. Never
  // trust the client — a spoofed/missing value for a REQUIRED custom field
  // must be rejected here even if the field was removed from the DOM via
  // devtools before submit. Mirrors the built-in field-mode re-validation
  // above.
  const customFields = await prisma.customField.findMany({ where: { projectId: project.id } });
  const customFieldValues: { customFieldId: string; value: string }[] = [];
  for (const field of customFields) {
    const raw = formData.get(`cf_${field.key}`);
    const value = field.fieldType === "CHECKBOX" ? String(raw === "true" || raw === "on") : String(raw ?? "").trim();
    const error = validateCustomFieldValue(field, value);
    if (error) return { error };
    if (value) customFieldValues.push({ customFieldId: field.id, value });
  }

  // --- Validate attachments BEFORE creating anything, so a bad file never
  // leaves a half-created ticket behind. Actually saving them to disk still
  // happens after the ticket exists (see below) since saveUploadedFile()
  // needs the ticket's id for its storage path, but the fallible
  // "is this file even acceptable" check happens up front.
  if (project.attachmentsMode !== "HIDDEN") {
    for (const file of files) {
      try {
        assertValidUpload(file);
      } catch (err) {
        if (err instanceof UploadValidationError) return { error: err.message };
        throw err;
      }
    }
  }

  let ticketNumber = "";
  let ticketId = "";
  let ticket: { id: string; ticketNumber: string; subject: string; submitterEmail: string | null; category: string };
  try {
    const createdAt = new Date();
    const slaDueAt = computeSlaDueAt(priority, createdAt);
    ticketNumber = await generateTicketNumber(project.id);

    // The ticket row and its custom-field values are the atomic "did the
    // ticket get created" unit — either both happen or neither does, so we
    // never end up with a ticket that's silently missing the custom data
    // the submitter filled in.
    const created = await prisma.$transaction(async (tx) => {
      const t = await tx.ticket.create({
        data: {
          projectId: project.id,
          ticketNumber,
          subject,
          description,
          category: category as never,
          priority: priority as never,
          submitterName,
          submitterPhone,
          submitterEmail,
          contractNumber,
          slaDueAt,
          createdAt,
        },
      });
      if (customFieldValues.length > 0) {
        await tx.ticketFieldValue.createMany({
          data: customFieldValues.map((v) => ({ ticketId: t.id, customFieldId: v.customFieldId, value: v.value })),
        });
      }
      return t;
    });
    ticket = created;
    ticketId = created.id;
  } catch (err) {
    console.error("[createTicketAction] core ticket creation failed", err);
    return { error: "حدث خطأ أثناء إنشاء التذكرة. يرجى المحاولة مرة أخرى." };
  }

  // --- Past this point the ticket is REAL and already visible to the
  // support team. Attachments and the notification email are best-effort:
  // if either fails, we log it and still send the submitter to the success
  // page with their real ticket number, instead of telling them "please
  // try again" and risking a confused duplicate submission for a ticket
  // that in fact already exists.
  if (project.attachmentsMode !== "HIDDEN") {
    for (const file of files) {
      try {
        const saved = await saveUploadedFile(ticket.id, file);
        await prisma.attachment.create({
          data: {
            ticketId: ticket.id,
            filename: saved.filename,
            path: saved.storedPath,
            mimeType: saved.mimeType,
            size: saved.size,
          },
        });
      } catch (err) {
        console.error(`[createTicketAction] attachment save failed for ticket ${ticket.ticketNumber}`, err);
      }
    }
  }

  try {
    await notifyTicketCreated(
      {
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        submitterEmail: ticket.submitterEmail,
        category: ticket.category,
      },
      { id: project.id, slug: project.slug, name: project.name }
    );
  } catch (err) {
    console.error(`[createTicketAction] notification failed for ticket ${ticket.ticketNumber}`, err);
  }

  redirect(`/${slug}/tickets/new/success?ticket=${ticketNumber}&id=${ticketId}`);
}
