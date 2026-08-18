// Shared ticket-queue filter construction, used by BOTH the ticket queue
// page (/dashboard, src/app/dashboard/page.tsx) and the CSV export route
// (/dashboard/export.csv, src/app/dashboard/export.csv/route.ts) so the two
// views of "the currently filtered ticket set" can never drift apart —
// the export always reflects exactly the same `where` clause the queue
// page would use for the same query string.

import { Prisma } from "@prisma/client";
import { ViewerScope, scopedProjectWhere } from "@/lib/access";

export type TicketQueueFilters = {
  status?: string;
  category?: string;
  priority?: string;
  assignedToId?: string;
  projectId?: string;
  tagId?: string;
  overdue?: string;
  q?: string;
  sort?: string;
};

export function buildTicketQueueWhere(
  scope: ViewerScope,
  filters: TicketQueueFilters
): Prisma.TicketWhereInput {
  const where: Prisma.TicketWhereInput = {};
  const projectFilter = scopedProjectWhere(scope, filters.projectId);
  if (projectFilter !== undefined) where.projectId = projectFilter as never;

  if (filters.status) where.status = filters.status as never;
  if (filters.category) where.category = filters.category as never;
  if (filters.priority) where.priority = filters.priority as never;
  if (filters.assignedToId === "unassigned") where.assignedToId = null;
  else if (filters.assignedToId) where.assignedToId = filters.assignedToId;
  if (filters.tagId) where.tags = { some: { tagId: filters.tagId } };
  if (filters.q) {
    // Matches ticketNumber/subject (original v1-v6 behavior) plus the
    // ticket's own description and any message body (agent or submitter,
    // internal note or not — this is the staff dashboard, everything here
    // is already visible to the viewer) — a ticket whose subject doesn't
    // mention the keyword but whose description or a reply does should
    // still show up. `messages: { some: { ... } }` compiles to a WHERE
    // EXISTS subquery, not a join, so it can't multiply result rows the
    // way a naive join would — no `distinct` needed here or in the CSV
    // export's batched skip/take walk (src/app/dashboard/export.csv/route.ts),
    // which imports this same builder.
    //
    // SQLite's `contains` is a plain LIKE scan (no index, no relevance
    // ranking) — fine at this app's current scale, not something a real
    // production/high-volume deployment should keep long-term. See the
    // "Ticket search" note in README.md for the Postgres tsvector/tsquery
    // upgrade path once the Postgres migration is actually applied.
    where.OR = [
      { ticketNumber: { contains: filters.q } },
      { subject: { contains: filters.q } },
      { description: { contains: filters.q } },
      { messages: { some: { body: { contains: filters.q } } } },
    ];
  }
  // "متأخرة فقط" pushed into the query itself (matches isOverdue's exact
  // definition) instead of fetching everything and filtering in memory.
  if (filters.overdue === "1") {
    where.slaDueAt = { lt: new Date() };
    if (!filters.status) where.status = { notIn: ["RESOLVED", "CLOSED"] } as never;
  }
  return where;
}

export function buildTicketQueueOrderBy(sort?: string): Prisma.TicketOrderByWithRelationInput {
  const [sortField, sortDir] = (sort || "createdAt_desc").split("_") as [string, "asc" | "desc"];
  return sortField === "slaDueAt" ? { slaDueAt: sortDir } : { createdAt: sortDir };
}
