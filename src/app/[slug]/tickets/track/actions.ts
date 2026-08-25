"use server";

import { prisma } from "@/lib/prisma";
import { saveUploadedFile, UploadValidationError } from "@/lib/upload";
import { STATUS_LABELS } from "@/lib/config";
import { redirect } from "next/navigation";

export type ReplyState = { error?: string; success?: boolean };

export async function submitterReplyAction(
  slug: string,
  _prev: ReplyState,
  formData: FormData
): Promise<ReplyState> {
  const ticketNumber = String(formData.get("ticketNumber") || "").trim();
  const submitterPhone = String(formData.get("submitterPhone") || "").trim();
  const body = String(formData.get("body") || "").trim();

  if (!ticketNumber || !submitterPhone) {
    return { error: "بيانات غير صالحة." };
  }
  if (!body) {
    return { error: "يرجى كتابة رسالة." };
  }

  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) {
    return { error: "المشروع غير موجود." };
  }

  const ticket = await prisma.ticket.findFirst({
    where: { ticketNumber, submitterPhone, projectId: project.id },
  });
  if (!ticket) {
    return { error: "لم يتم العثور على التذكرة." };
  }

  const files = formData
    .getAll("attachments")
    .filter((f): f is File => f instanceof File && f.size > 0);

  try {
    const message = await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorType: "SUBMITTER",
        authorName: ticket.submitterName,
        isInternalNote: false,
        body,
      },
    });

    for (const file of files) {
      const saved = await saveUploadedFile(ticket.id, file);
      await prisma.attachment.create({
        data: {
          ticketId: ticket.id,
          messageId: message.id,
          filename: saved.filename,
          path: saved.storedPath,
          mimeType: saved.mimeType,
          size: saved.size,
        },
      });
    }

    // Reopen ticket if it had been resolved/closed and the submitter replied.
    if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: "OPEN", resolvedAt: null },
      });
      // Every other status change in the app is logged to the activity
      // timeline — this automatic one was the one silent exception, which
      // left agents unable to see *why* a resolved ticket came back to
      // life. actorName is the submitter's own name since they, not an
      // agent, triggered this transition.
      await prisma.ticketActivity.create({
        data: {
          ticketId: ticket.id,
          actorName: ticket.submitterName,
          action: "STATUS_CHANGED",
          fromValue: STATUS_LABELS[ticket.status] || ticket.status,
          toValue: STATUS_LABELS.OPEN,
        },
      });
    } else if (ticket.status === "NEW") {
      await prisma.ticket.update({ where: { id: ticket.id }, data: { status: "OPEN" } });
    }
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return { error: err.message };
    }
    console.error("[submitterReplyAction]", err);
    return { error: "حدث خطأ أثناء إرسال الرد." };
  }

  redirect(
    `/${slug}/tickets/track?ticketNumber=${encodeURIComponent(ticketNumber)}&phone=${encodeURIComponent(
      submitterPhone
    )}`
  );
}
