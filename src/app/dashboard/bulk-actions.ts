"use server";

// Bulk actions for the ticket queue (/dashboard): status change, assign,
// add-tag, applied to a set of selected ticket ids at once.
//
// Defense in depth: a submitted ticket-id list is NEVER trusted just
// because the UI only rendered checkboxes for tickets the viewer could see
// — the queue could be stale, or the ids could be tampered with directly
// (e.g. via devtools), same threat model as every other server action in
// this app. Every ticket id received here is independently re-fetched and
// re-checked against canAccessProject() before anything is written; ids
// that don't pass are silently skipped (counted, not erased silently) —
// never trusted.
//
// Each successful per-ticket change logs to TicketActivity exactly like
// the existing single-ticket update flow in
// src/app/dashboard/tickets/[id]/actions.ts (updateTicketAction /
// addExistingTagAction) — reusing the same action names/labels so the
// activity timeline reads identically regardless of whether the change
// came from the single-ticket page or a bulk operation. This is
// deliberately the same audit path, not a second one.

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getViewerScope, canAccessProject, ViewerScope } from "@/lib/access";
import { notifyResolved } from "@/lib/notifications";
import { STATUS_LABELS } from "@/lib/config";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

export type BulkActionResult = { updated: number; skipped: number; error?: string };

type TicketWithProject = Prisma.TicketGetPayload<{ include: { project: true } }>;

async function loadAccessibleTickets(
  ticketIds: string[]
): Promise<{ scope: ViewerScope | null; tickets: TicketWithProject[]; skippedForAccess: number }> {
  const uniqueIds = Array.from(new Set(ticketIds.filter(Boolean)));
  const scope = await getViewerScope();
  if (!scope || uniqueIds.length === 0) return { scope, tickets: [], skippedForAccess: 0 };

  const tickets = await prisma.ticket.findMany({
    where: { id: { in: uniqueIds } },
    include: { project: true },
  });
  const accessible = tickets.filter((t) => canAccessProject(scope, t.projectId));
  return { scope, tickets: accessible, skippedForAccess: uniqueIds.length - accessible.length };
}

export async function bulkUpdateStatusAction(ticketIds: string[], status: string): Promise<BulkActionResult> {
  const session = await auth();
  if (!session?.user) return { updated: 0, skipped: ticketIds.length, error: "غير مصرح." };
  if (!STATUS_LABELS[status]) return { updated: 0, skipped: ticketIds.length, error: "حالة غير صالحة." };

  const { scope, tickets, skippedForAccess } = await loadAccessibleTickets(ticketIds);
  if (!scope) return { updated: 0, skipped: ticketIds.length, error: "غير مصرح." };

  let updated = 0;
  for (const ticket of tickets) {
    if (ticket.status === status) continue;
    const resolvedAt =
      status === "RESOLVED" ? new Date() : status === "CLOSED" ? ticket.resolvedAt ?? new Date() : null;

    await prisma.ticket.update({ where: { id: ticket.id }, data: { status, resolvedAt } });
    await prisma.ticketActivity.create({
      data: {
        ticketId: ticket.id,
        actorName: session.user.name || "فريق الدعم",
        action: "STATUS_CHANGED",
        fromValue: STATUS_LABELS[ticket.status] || ticket.status,
        toValue: STATUS_LABELS[status] || status,
      },
    });

    if (status === "RESOLVED") {
      await notifyResolved(
        { id: ticket.id, ticketNumber: ticket.ticketNumber, submitterEmail: ticket.submitterEmail },
        { slug: ticket.project.slug, name: ticket.project.name }
      );
    }
    updated++;
  }

  revalidatePath("/dashboard");
  return { updated, skipped: tickets.length - updated + skippedForAccess };
}

export async function bulkAssignAction(ticketIds: string[], assignedToId: string): Promise<BulkActionResult> {
  const session = await auth();
  if (!session?.user) return { updated: 0, skipped: ticketIds.length, error: "غير مصرح." };

  const normalizedAssignee = assignedToId === "" ? null : assignedToId;
  let toUser: { name: string } | null = null;
  if (normalizedAssignee) {
    toUser = await prisma.user.findUnique({ where: { id: normalizedAssignee } });
    if (!toUser) return { updated: 0, skipped: ticketIds.length, error: "موظف غير صالح." };
  }

  const { scope, tickets, skippedForAccess } = await loadAccessibleTickets(ticketIds);
  if (!scope) return { updated: 0, skipped: ticketIds.length, error: "غير مصرح." };

  let updated = 0;
  for (const ticket of tickets) {
    if ((ticket.assignedToId || "") === (normalizedAssignee || "")) continue;
    const fromUser = ticket.assignedToId
      ? await prisma.user.findUnique({ where: { id: ticket.assignedToId } })
      : null;

    await prisma.ticket.update({ where: { id: ticket.id }, data: { assignedToId: normalizedAssignee } });
    await prisma.ticketActivity.create({
      data: {
        ticketId: ticket.id,
        actorName: session.user.name || "فريق الدعم",
        action: "ASSIGNED",
        fromValue: fromUser?.name || "غير مسندة",
        toValue: toUser?.name || "غير مسندة",
      },
    });
    updated++;
  }

  revalidatePath("/dashboard");
  return { updated, skipped: tickets.length - updated + skippedForAccess };
}

export async function bulkAddTagAction(ticketIds: string[], tagId: string): Promise<BulkActionResult> {
  const session = await auth();
  if (!session?.user) return { updated: 0, skipped: ticketIds.length, error: "غير مصرح." };
  if (!tagId) return { updated: 0, skipped: ticketIds.length, error: "يرجى اختيار وسم." };

  const tag = await prisma.tag.findUnique({ where: { id: tagId } });
  if (!tag) return { updated: 0, skipped: ticketIds.length, error: "وسم غير صالح." };

  const { scope, tickets, skippedForAccess } = await loadAccessibleTickets(ticketIds);
  if (!scope) return { updated: 0, skipped: ticketIds.length, error: "غير مصرح." };

  let updated = 0;
  let projectMismatch = 0;
  for (const ticket of tickets) {
    // A tag belongs to exactly one project — mirrors the single-ticket
    // addExistingTagAction check in src/app/dashboard/tickets/[id]/actions.ts.
    if (ticket.projectId !== tag.projectId) {
      projectMismatch++;
      continue;
    }
    const existing = await prisma.ticketTag.findUnique({
      where: { ticketId_tagId: { ticketId: ticket.id, tagId } },
    });
    if (existing) continue;

    await prisma.ticketTag.create({ data: { ticketId: ticket.id, tagId } });
    await prisma.ticketActivity.create({
      data: {
        ticketId: ticket.id,
        actorName: session.user.name || "فريق الدعم",
        action: "TAG_ADDED",
        toValue: tag.name,
      },
    });
    updated++;
  }

  revalidatePath("/dashboard");
  return { updated, skipped: tickets.length - updated + skippedForAccess };
}
