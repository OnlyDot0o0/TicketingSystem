"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getViewerScope, canAccessProject } from "@/lib/access";
import { saveUploadedFile, UploadValidationError } from "@/lib/upload";
import { notifyAgentReply, notifyResolved } from "@/lib/notifications";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/config";
import { validateCustomFieldValue } from "@/lib/customFields";
import { categoryLabel } from "@/lib/categories";
import { computeSlaDueAt, PriorityLevel } from "@/lib/sla";
import { revalidatePath } from "next/cache";

export type AgentReplyState = { error?: string };

async function requireTicketAccess(ticketId: string) {
  const scope = await getViewerScope();
  if (!scope) return { scope: null, ticket: null };
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { project: true } });
  if (!ticket) return { scope, ticket: null };
  if (!canAccessProject(scope, ticket.projectId)) return { scope, ticket: null };
  return { scope, ticket };
}

export async function agentReplyAction(
  _prev: AgentReplyState,
  formData: FormData
): Promise<AgentReplyState> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح." };

  const ticketId = String(formData.get("ticketId") || "");
  const body = String(formData.get("body") || "").trim();
  const isInternalNote = formData.get("isInternalNote") === "on";

  if (!ticketId || !body) return { error: "يرجى كتابة رسالة." };

  const { scope, ticket } = await requireTicketAccess(ticketId);
  if (!scope) return { error: "غير مصرح." };
  if (!ticket) return { error: "التذكرة غير موجودة." };

  const files = formData
    .getAll("attachments")
    .filter((f): f is File => f instanceof File && f.size > 0);

  try {
    const message = await prisma.ticketMessage.create({
      data: {
        ticketId,
        authorType: "AGENT",
        authorName: session.user.name || "فريق الدعم",
        isInternalNote,
        body,
      },
    });

    for (const file of files) {
      const saved = await saveUploadedFile(ticketId, file);
      await prisma.attachment.create({
        data: {
          ticketId,
          messageId: message.id,
          filename: saved.filename,
          path: saved.storedPath,
          mimeType: saved.mimeType,
          size: saved.size,
        },
      });
    }

    if (!isInternalNote) {
      // A visible reply nudges the ticket into PENDING (waiting on submitter)
      // if it isn't already resolved/closed.
      if (ticket.status !== "RESOLVED" && ticket.status !== "CLOSED" && ticket.status !== "PENDING") {
        await prisma.ticket.update({ where: { id: ticketId }, data: { status: "PENDING" } });
        await prisma.ticketActivity.create({
          data: {
            ticketId,
            actorName: session.user.name || "فريق الدعم",
            action: "STATUS_CHANGED",
            fromValue: STATUS_LABELS[ticket.status] || ticket.status,
            toValue: STATUS_LABELS.PENDING,
          },
        });
      }
      await notifyAgentReply(
        { ticketNumber: ticket.ticketNumber, submitterEmail: ticket.submitterEmail },
        { slug: ticket.project.slug, name: ticket.project.name }
      );
    }
  } catch (err) {
    if (err instanceof UploadValidationError) return { error: err.message };
    console.error("[agentReplyAction]", err);
    return { error: "حدث خطأ أثناء الإرسال." };
  }

  revalidatePath(`/dashboard/tickets/${ticketId}`);
  return {};
}

export async function updateTicketAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) return;

  const ticketId = String(formData.get("ticketId") || "");
  if (!ticketId) return;

  const { scope, ticket } = await requireTicketAccess(ticketId);
  if (!scope || !ticket) return;

  const status = formData.get("status") as string | null;
  const priority = formData.get("priority") as string | null;
  const category = formData.get("category") as string | null;
  const assignedToRaw = formData.get("assignedToId") as string | null;

  const data: Record<string, unknown> = {};
  const activities: { action: string; fromValue: string | null; toValue: string | null }[] = [];

  if (status && status !== ticket.status) {
    data.status = status;
    data.resolvedAt = status === "RESOLVED" ? new Date() : status === "CLOSED" ? ticket.resolvedAt ?? new Date() : null;
    activities.push({ action: "STATUS_CHANGED", fromValue: STATUS_LABELS[ticket.status] || ticket.status, toValue: STATUS_LABELS[status] || status });
  }
  if (priority && priority !== ticket.priority) {
    data.priority = priority;
    activities.push({ action: "PRIORITY_CHANGED", fromValue: PRIORITY_LABELS[ticket.priority] || ticket.priority, toValue: PRIORITY_LABELS[priority] || priority });
    // Priority drives the SLA target (src/lib/sla.ts) — recompute the due
    // date from this ticket's own createdAt (not "now"), so reprioritizing
    // an already-old ticket tightens/loosens its deadline based on how long
    // it's actually been open, rather than handing it a fresh window
    // starting at the moment of the change. Clearing slaWarningSentAt
    // re-arms the SLA-breach warning for the new target — a warning already
    // sent for the OLD due date says nothing about whether the ticket is
    // within threshold of the new one.
    data.slaDueAt = computeSlaDueAt(priority as PriorityLevel, ticket.project, ticket.createdAt);
    data.slaWarningSentAt = null;
  }
  if (category && category !== ticket.category) {
    // Categories are per-project (v6) — re-validate the submitted key
    // against this ticket's own project, never trust the client. A select
    // element only ever offers this project's own categories, but a
    // spoofed value (e.g. another project's category key via devtools)
    // must still be rejected server-side here, same as every other
    // ticket-editing action in this app.
    const projectCategories = await prisma.category.findMany({ where: { projectId: ticket.projectId } });
    if (projectCategories.some((c) => c.key === category)) {
      data.category = category;
      activities.push({
        action: "CATEGORY_CHANGED",
        fromValue: categoryLabel(projectCategories, ticket.category),
        toValue: categoryLabel(projectCategories, category),
      });
    }
  }
  if (assignedToRaw !== null && assignedToRaw !== (ticket.assignedToId || "")) {
    data.assignedToId = assignedToRaw === "" ? null : assignedToRaw;
    const [fromUser, toUser] = await Promise.all([
      ticket.assignedToId ? prisma.user.findUnique({ where: { id: ticket.assignedToId } }) : null,
      assignedToRaw ? prisma.user.findUnique({ where: { id: assignedToRaw } }) : null,
    ]);
    activities.push({ action: "ASSIGNED", fromValue: fromUser?.name || "غير مسندة", toValue: toUser?.name || "غير مسندة" });
  }

  if (Object.keys(data).length > 0) {
    await prisma.ticket.update({ where: { id: ticketId }, data });

    if (activities.length > 0) {
      await prisma.ticketActivity.createMany({
        data: activities.map((a) => ({
          ticketId,
          actorName: session.user.name || "فريق الدعم",
          action: a.action,
          fromValue: a.fromValue,
          toValue: a.toValue,
        })),
      });
    }

    if (data.status === "RESOLVED") {
      await notifyResolved(
        { id: ticket.id, ticketNumber: ticket.ticketNumber, submitterEmail: ticket.submitterEmail },
        { slug: ticket.project.slug, name: ticket.project.name }
      );
    }
  }

  revalidatePath(`/dashboard/tickets/${ticketId}`);
  revalidatePath("/dashboard");
}

export async function assignToMeAction(ticketId: string) {
  const session = await auth();
  if (!session?.user) return;
  const { scope, ticket } = await requireTicketAccess(ticketId);
  if (!scope || !ticket) return;

  await prisma.ticket.update({ where: { id: ticketId }, data: { assignedToId: session.user.id } });
  await prisma.ticketActivity.create({
    data: {
      ticketId,
      actorName: session.user.name || "فريق الدعم",
      action: "ASSIGNED",
      fromValue: ticket.assignedToId ? (await prisma.user.findUnique({ where: { id: ticket.assignedToId } }))?.name || null : "غير مسندة",
      toValue: session.user.name || "فريق الدعم",
    },
  });
  revalidatePath(`/dashboard/tickets/${ticketId}`);
  revalidatePath("/dashboard");
}

// --- Tags ---------------------------------------------------------------

export type TagFormState = { error?: string };

export async function addExistingTagAction(ticketId: string, tagId: string) {
  const session = await auth();
  if (!session?.user) return;
  const { scope, ticket } = await requireTicketAccess(ticketId);
  if (!scope || !ticket) return;

  const tag = await prisma.tag.findUnique({ where: { id: tagId } });
  if (!tag || tag.projectId !== ticket.projectId) return; // tag must belong to the same project

  await prisma.ticketTag.upsert({
    where: { ticketId_tagId: { ticketId, tagId } },
    update: {},
    create: { ticketId, tagId },
  });
  await prisma.ticketActivity.create({
    data: { ticketId, actorName: session.user.name || "فريق الدعم", action: "TAG_ADDED", toValue: tag.name },
  });
  revalidatePath(`/dashboard/tickets/${ticketId}`);
}

export async function createAndAddTagAction(
  _prev: TagFormState,
  formData: FormData
): Promise<TagFormState> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح." };

  const ticketId = String(formData.get("ticketId") || "");
  const name = String(formData.get("name") || "").trim();
  const colorHex = String(formData.get("colorHex") || "").trim() || null;
  if (!ticketId || !name) return { error: "يرجى كتابة اسم الوسم." };

  const { scope, ticket } = await requireTicketAccess(ticketId);
  if (!scope || !ticket) return { error: "غير مصرح." };

  const tag = await prisma.tag.upsert({
    where: { projectId_name: { projectId: ticket.projectId, name } },
    update: {},
    create: { projectId: ticket.projectId, name, colorHex },
  });

  await prisma.ticketTag.upsert({
    where: { ticketId_tagId: { ticketId, tagId: tag.id } },
    update: {},
    create: { ticketId, tagId: tag.id },
  });
  await prisma.ticketActivity.create({
    data: { ticketId, actorName: session.user.name || "فريق الدعم", action: "TAG_ADDED", toValue: tag.name },
  });

  revalidatePath(`/dashboard/tickets/${ticketId}`);
  return {};
}

// --- Custom field values -------------------------------------------------
// Baseline ticket-editing action, available to ANY project member
// regardless of role/permission toggles (canManageTicketForm gates the
// field DEFINITIONS on /dashboard/projects/[id], not per-ticket values —
// see README). Uses the same requireTicketAccess() gate as every other
// ticket-editing action in this file.

export type CustomFieldValueState = { error?: string };

export async function updateCustomFieldValueAction(
  _prev: CustomFieldValueState,
  formData: FormData
): Promise<CustomFieldValueState> {
  const ticketId = String(formData.get("ticketId") || "");
  const customFieldId = String(formData.get("customFieldId") || "");
  const rawValue = String(formData.get("value") || "");

  const { scope, ticket } = await requireTicketAccess(ticketId);
  if (!scope || !ticket) return { error: "غير مصرح." };

  const field = await prisma.customField.findUnique({ where: { id: customFieldId } });
  if (!field || field.projectId !== ticket.projectId) return { error: "حقل غير صالح." };

  const value = field.fieldType === "CHECKBOX" ? String(rawValue === "true" || rawValue === "on") : rawValue.trim();
  const error = validateCustomFieldValue(field, value);
  if (error) return { error };

  if (!value && field.fieldType !== "CHECKBOX") {
    await prisma.ticketFieldValue.deleteMany({ where: { ticketId, customFieldId } });
  } else {
    await prisma.ticketFieldValue.upsert({
      where: { ticketId_customFieldId: { ticketId, customFieldId } },
      update: { value },
      create: { ticketId, customFieldId, value },
    });
  }

  revalidatePath(`/dashboard/tickets/${ticketId}`);
  return {};
}

export async function removeTagAction(ticketId: string, tagId: string) {
  const session = await auth();
  if (!session?.user) return;
  const { scope, ticket } = await requireTicketAccess(ticketId);
  if (!scope || !ticket) return;

  const tag = await prisma.tag.findUnique({ where: { id: tagId } });
  await prisma.ticketTag.deleteMany({ where: { ticketId, tagId } });
  if (tag) {
    await prisma.ticketActivity.create({
      data: { ticketId, actorName: session.user.name || "فريق الدعم", action: "TAG_REMOVED", fromValue: tag.name },
    });
  }
  revalidatePath(`/dashboard/tickets/${ticketId}`);
}
