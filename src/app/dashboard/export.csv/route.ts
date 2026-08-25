import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireScopedViewer } from "@/lib/access";
import { buildTicketQueueWhere, buildTicketQueueOrderBy, TicketQueueFilters } from "@/lib/ticketQueue";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/config";
import { Prisma } from "@prisma/client";
import { captureException, isNextControlFlowError } from "@/lib/sentry";

// CSV export of the ticket queue's CURRENTLY FILTERED result set — the
// exact same `where`/`orderBy` construction as /dashboard
// (src/app/dashboard/page.tsx), imported from src/lib/ticketQueue.ts rather
// than duplicated, so the two can never drift apart. Gated by the same
// requireScopedViewer()/scopedProjectWhere() scoping as the queue page
// itself (scopedProjectWhere is called inside buildTicketQueueWhere and
// will notFound() a projectId the viewer can't access, same as the page).
//
// Exports the FULL filtered set, not just one paginated page. Streamed in
// BATCH_SIZE-row chunks rather than one prisma.findMany() + one giant
// string held entirely in memory — a project with a genuinely large ticket
// history exporting a broad filter shouldn't need to buffer the whole
// result set (and its serialized CSV) in the server process at once.
const BATCH_SIZE = 1000;

const HEADER = [
  "رقم التذكرة",
  "المشروع",
  "الموضوع",
  "التصنيف",
  "الأولوية",
  "الحالة",
  "الموظف المسؤول",
  "اسم مقدّم الطلب",
  "جوال مقدّم الطلب",
  "تاريخ الإنشاء",
  "موعد استحقاق SLA",
];

type ExportTicket = Prisma.TicketGetPayload<{ include: { project: true; assignedTo: true } }>;

function rowFor(t: ExportTicket, categoryLabelMap: Map<string, string>): string[] {
  return [
    t.ticketNumber,
    t.project.name,
    t.subject,
    categoryLabelMap.get(`${t.projectId}:${t.category}`) ?? t.category,
    PRIORITY_LABELS[t.priority] ?? t.priority,
    STATUS_LABELS[t.status] ?? t.status,
    t.assignedTo?.name ?? "غير مسندة",
    t.submitterName,
    t.submitterPhone,
    new Date(t.createdAt).toLocaleString("ar-SA"),
    new Date(t.slaDueAt).toLocaleString("ar-SA"),
  ];
}

function csvEscapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvLine(cells: string[]): string {
  return cells.map(csvEscapeCell).join(",");
}

// (v9) This handler had no top-level error handling at all before — an
// unexpected failure (e.g. a DB connectivity blip) would propagate
// uncaught to Next's default error handling with nothing recorded
// anywhere. Wrapped here to report to Sentry (no-op until configured, see
// src/lib/sentry.ts) while leaving the actual response behavior
// unchanged — Next's own notFound()/redirect() control-flow "errors" from
// requireScopedViewer()/buildTicketQueueWhere() are explicitly excluded
// (see isNextControlFlowError) so a normal 404/redirect never gets
// reported as if it were a bug.
export async function GET(req: NextRequest) {
  try {
    return await handleExport(req);
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    captureException(err, { route: "/dashboard/export.csv" });
    throw err;
  }
}

async function handleExport(req: NextRequest) {
  const scope = await requireScopedViewer();

  const sp = req.nextUrl.searchParams;
  const filters: TicketQueueFilters = {
    status: sp.get("status") || undefined,
    category: sp.get("category") || undefined,
    priority: sp.get("priority") || undefined,
    assignedToId: sp.get("assignedToId") || undefined,
    projectId: sp.get("projectId") || undefined,
    tagId: sp.get("tagId") || undefined,
    overdue: sp.get("overdue") || undefined,
    q: sp.get("q") || undefined,
    sort: sp.get("sort") || undefined,
  };

  const where = buildTicketQueueWhere(scope, filters);
  const primaryOrderBy = buildTicketQueueOrderBy(filters.sort);

  // Categories are per-project now (v6) — preload every category this
  // export could possibly need a label for (every project accessible to
  // this viewer, same scoping the queue page itself uses) into a single
  // map, rather than a query per row.
  const categoryRows = await prisma.category.findMany({
    where: scope.isSuperAdmin ? undefined : { projectId: { in: scope.projectIds || [] } },
    select: { projectId: true, key: true, label: true },
  });
  const categoryLabelMap = new Map(categoryRows.map((c) => [`${c.projectId}:${c.key}`, c.label]));
  // A batched skip/take walk needs a STRICT total order to guarantee no
  // row is skipped or repeated across batch boundaries — createdAt/slaDueAt
  // alone can tie (two tickets created in the same second, say), which the
  // paginated queue PAGE can shrug off (a human paging 25 at a time won't
  // notice a rare tie) but an unattended full-set export walking
  // potentially tens of thousands of rows in 1000-row chunks needs to be
  // exact. `id` as a tie-breaker makes the sort deterministic.
  const stableOrderBy = [primaryOrderBy, { id: "asc" as const }];

  const encoder = new TextEncoder();
  const today = new Date().toISOString().slice(0, 10);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // UTF-8 BOM (U+FEFF) so Arabic text opens correctly in Excel (the
        // realistic consumer here) instead of being mis-decoded as the
        // system codepage. Built via fromCharCode rather than a literal
        // BOM character in this source file, since some tooling strips a
        // literal BOM anywhere it appears, not just at file-start.
        const BOM = String.fromCharCode(0xfeff);
        controller.enqueue(encoder.encode(BOM + csvLine(HEADER) + "\r\n"));

        let skip = 0;
        for (;;) {
          const batch = await prisma.ticket.findMany({
            where,
            orderBy: stableOrderBy,
            include: { project: true, assignedTo: true },
            skip,
            take: BATCH_SIZE,
          });
          if (batch.length === 0) break;

          const chunk = batch.map((t) => csvLine(rowFor(t, categoryLabelMap))).join("\r\n") + "\r\n";
          controller.enqueue(encoder.encode(chunk));

          if (batch.length < BATCH_SIZE) break;
          skip += batch.length;
        }
        controller.close();
      } catch (err) {
        // This is inside the stream body, past the point where the outer
        // try/catch in GET() above could still catch it (the Response has
        // already been returned) — reported here instead, same no-op-until-
        // configured Sentry helper.
        captureException(err, { route: "/dashboard/export.csv", stage: "streaming" });
        controller.error(err);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tickets-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
