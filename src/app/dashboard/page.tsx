import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CATEGORY_LABELS, PRIORITY_LABELS, STATUS_LABELS } from "@/lib/config";
import { requireScopedViewer } from "@/lib/access";
import { buildTicketQueueWhere, buildTicketQueueOrderBy, TicketQueueFilters } from "@/lib/ticketQueue";
import TicketQueueTable from "./TicketQueueTable";

type SearchParams = TicketQueueFilters & { page?: string };

const PAGE_SIZE = 25;

export default async function DashboardTicketsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const scope = await requireScopedViewer();

  const where = buildTicketQueueWhere(scope, searchParams);
  const orderBy = buildTicketQueueOrderBy(searchParams.sort);

  const page = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);

  const accessibleProjectWhere = scope.isSuperAdmin ? undefined : { id: { in: scope.projectIds || [] } };

  const [total, tickets, agents, projects, tags] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      orderBy,
      include: { assignedTo: true, project: true, tags: { include: { tag: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    // Agent-assignment dropdown: only support-team members with access to
    // at least one of the same projects the viewer can see (SUPER_ADMIN
    // still sees everyone active).
    scope.isSuperAdmin
      ? prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } })
      : prisma.user.findMany({
          where: { active: true, memberships: { some: { projectId: { in: scope.projectIds || [] } } } },
          orderBy: { name: "asc" },
        }),
    prisma.project.findMany({ where: accessibleProjectWhere, orderBy: { name: "asc" } }),
    prisma.tag.findMany({ where: accessibleProjectWhere ? { projectId: { in: scope.projectIds || [] } } : undefined, orderBy: { name: "asc" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Shared with pageHref/exportHref below: every currently-active filter,
  // as a plain object, so both helpers (and the "my tickets" toggle) stay
  // in sync with whatever's actually in the URL instead of drifting apart.
  const activeParams = () => {
    const params = new URLSearchParams();
    if (searchParams.q) params.set("q", searchParams.q);
    if (searchParams.status) params.set("status", searchParams.status);
    if (searchParams.category) params.set("category", searchParams.category);
    if (searchParams.priority) params.set("priority", searchParams.priority);
    if (searchParams.assignedToId) params.set("assignedToId", searchParams.assignedToId);
    if (searchParams.projectId) params.set("projectId", searchParams.projectId);
    if (searchParams.tagId) params.set("tagId", searchParams.tagId);
    if (searchParams.overdue) params.set("overdue", searchParams.overdue);
    if (searchParams.sort) params.set("sort", searchParams.sort);
    return params;
  };

  const pageHref = (p: number) => {
    const params = activeParams();
    params.set("page", String(p));
    return `/dashboard?${params.toString()}`;
  };

  const exportHref = () => `/dashboard/export.csv?${activeParams().toString()}`;

  // "My tickets" quick filter: a one-click shortcut for picking yourself in
  // the "الموظف المسؤول" dropdown below — same assignedToId filter, just
  // faster to reach, and visually indicates when it's active. Toggles off
  // (back to "كل الموظفين") if clicked again while already active.
  const isMyTickets = searchParams.assignedToId === scope.userId;
  const myTicketsHref = () => {
    const params = activeParams();
    if (isMyTickets) params.delete("assignedToId");
    else params.set("assignedToId", scope.userId);
    return `/dashboard?${params.toString()}`;
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-teal">قائمة التذاكر</h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-ink-soft">
            {total} تذكرة{totalPages > 1 ? ` — صفحة ${page} من ${totalPages}` : ""}
          </span>
          <Link
            href={myTicketsHref()}
            className={`btn ${isMyTickets ? "btn-primary" : "btn-outline"}`}
            aria-pressed={isMyTickets}
          >
            {isMyTickets ? "✓ تذاكري فقط" : "تذاكري فقط"}
          </Link>
          <a href={exportHref()} className="btn btn-outline">
            تصدير CSV
          </a>
        </div>
      </div>

      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-7" method="get">
        <input
          name="q"
          defaultValue={searchParams.q}
          placeholder="بحث برقم التذكرة أو العنوان"
          className="field sm:col-span-3 lg:col-span-2"
        />
        <select name="status" defaultValue={searchParams.status || ""} className="field">
          <option value="">كل الحالات</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select name="category" defaultValue={searchParams.category || ""} className="field">
          <option value="">كل التصنيفات</option>
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select name="priority" defaultValue={searchParams.priority || ""} className="field">
          <option value="">كل الأولويات</option>
          {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select name="assignedToId" defaultValue={searchParams.assignedToId || ""} className="field">
          <option value="">كل الموظفين</option>
          <option value="unassigned">غير مسندة</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select name="projectId" defaultValue={searchParams.projectId || ""} className="field">
          <option value="">كل المشاريع</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select name="tagId" defaultValue={searchParams.tagId || ""} className="field">
          <option value="">كل الوسوم</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select name="sort" defaultValue={searchParams.sort || "createdAt_desc"} className="field">
          <option value="createdAt_desc">الأحدث أولاً</option>
          <option value="createdAt_asc">الأقدم أولاً</option>
          <option value="slaDueAt_asc">أقرب موعد SLA</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="overdue" value="1" defaultChecked={searchParams.overdue === "1"} />
          متأخرة فقط
        </label>
        <button type="submit" className="btn btn-primary sm:col-span-1">تصفية</button>
        <Link href="/dashboard" className="btn btn-outline text-center sm:col-span-1">مسح</Link>
      </form>

      <TicketQueueTable tickets={tickets} agents={agents} tags={tags} currentUserId={scope.userId} />

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Link
            href={pageHref(Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={`btn btn-outline ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
          >
            السابق
          </Link>
          <span className="text-sm text-ink-soft">صفحة {page} من {totalPages}</span>
          <Link
            href={pageHref(Math.min(totalPages, page + 1))}
            aria-disabled={page >= totalPages}
            className={`btn btn-outline ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
          >
            التالي
          </Link>
        </div>
      )}
    </div>
  );
}
