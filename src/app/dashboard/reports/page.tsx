import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STATUS_LABELS } from "@/lib/config";
import { StatusPie, CategoryBar, TimeSeriesLine } from "./Charts";
import { getViewerScope, scopedProjectWhere, ViewerScope } from "@/lib/access";
import { buildTicketQueueWhere } from "@/lib/ticketQueue";

// This page used to fetch every in-scope ticket's status/category/date
// fields and reduce them in JS. That's fine at the ticket volumes this app
// launched with, but doesn't hold up at the scale this whole platform was
// built for (many projects, each potentially with a large ticket history):
// every metric below is now either a Prisma aggregate (groupBy/count/avg —
// pushed straight to the database) or, for the two metrics Prisma's
// high-level API can't express as a simple aggregate (average resolution
// TIME and SLA compliance, both needing a computed `resolvedAt - createdAt`
// comparison), a small raw SQL query scoped by the exact same
// viewer/project filter as everything else on this page.
//
// The raw SQL uses SQLite's julianday() for date arithmetic. When this
// project moves to Postgres (see README "Path to real production deploy"),
// these two queries need julianday(resolvedAt) - julianday(createdAt)
// replaced with EXTRACT(EPOCH FROM (resolvedAt - createdAt)) / 3600 —
// noted here so it isn't missed during that migration.

function projectFilterToSql(filter: undefined | string | { in: string[] }): Prisma.Sql {
  if (filter === undefined) return Prisma.sql`1=1`;
  if (typeof filter === "string") return Prisma.sql`"projectId" = ${filter}`;
  if (filter.in.length === 0) return Prisma.sql`1=0`; // no accessible projects — match nothing
  return Prisma.sql`"projectId" IN (${Prisma.join(filter.in)})`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { projectId?: string };
}) {
  const scope = await getViewerScope();
  if (!scope) redirect("/login");
  if (!scope.isSuperAdmin && !scope.permissions.canViewReports) {
    redirect("/dashboard");
  }
  if (!scope.isSuperAdmin && (scope.projectIds || []).length === 0) {
    redirect("/dashboard");
  }

  const projects = await prisma.project.findMany({
    where: scope.isSuperAdmin ? undefined : { id: { in: scope.projectIds || [] } },
    orderBy: { name: "asc" },
  });
  const projectId = searchParams.projectId || "";
  const activeProject = projectId ? projects.find((p) => p.id === projectId) : undefined;

  // Validates the requested projectId is actually accessible (404s
  // otherwise) and returns the shape every Prisma query below uses.
  const projectFilter = scopedProjectWhere(scope, projectId || undefined);
  const baseWhere = buildTicketQueueWhere(scope, { projectId });
  const overdueWhere = buildTicketQueueWhere(scope, { projectId, overdue: "1" });
  const projectSql = projectFilterToSql(projectFilter);

  const [
    total,
    currentlyOverdue,
    statusGroups,
    categoryGroups,
    csatAgg,
    dailyCounts,
    resolutionRow,
    slaRow,
  ] = await Promise.all([
    prisma.ticket.count({ where: baseWhere }),
    prisma.ticket.count({ where: overdueWhere }),
    prisma.ticket.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["category"], where: baseWhere, _count: { _all: true } }),
    prisma.ticket.aggregate({
      where: { ...baseWhere, satisfactionRating: { not: null } },
      _avg: { satisfactionRating: true },
      _count: { satisfactionRating: true },
    }),
    dailyCountsLast30Days(scope, projectFilter),
    prisma.$queryRaw<{ avgHours: number | null }[]>(
      // Prisma stores SQLite DateTime columns as INTEGER epoch-milliseconds
      // (confirmed via `typeof("resolvedAt")` = "integer" — it is NOT
      // ISO-8601 text despite that being Prisma's behavior on other
      // versions/setups). julianday() on the raw column silently returns
      // NULL, since a bare huge millisecond number isn't a valid Julian
      // day. `/1000.0` + the 'unixepoch' modifier tells SQLite to actually
      // interpret it as a Unix timestamp. Verified directly against the
      // known ticket data before trusting this in the page.
      Prisma.sql`
        SELECT AVG(
          (julianday("resolvedAt" / 1000.0, 'unixepoch') - julianday("createdAt" / 1000.0, 'unixepoch')) * 24
        ) AS "avgHours"
        FROM "Ticket"
        WHERE "resolvedAt" IS NOT NULL AND ${projectSql}
      `
    ),
    prisma.$queryRaw<{ total: number; withinSla: number }[]>(
      Prisma.sql`
        SELECT
          COUNT(*) AS "total",
          SUM(CASE WHEN "resolvedAt" IS NULL OR "resolvedAt" <= "slaDueAt" THEN 1 ELSE 0 END) AS "withinSla"
        FROM "Ticket"
        WHERE "status" IN ('RESOLVED', 'CLOSED') AND ${projectSql}
      `
    ),
  ]);

  const statusCounts = new Map(statusGroups.map((g) => [g.status, g._count._all]));
  const byStatus = Object.keys(STATUS_LABELS).map((s) => ({
    name: STATUS_LABELS[s],
    value: statusCounts.get(s) ?? 0,
  }));

  // Categories are per-project now (v6) — there's no longer a single global
  // category list to build the "by category" breakdown from. When exactly
  // one project is in view (either explicitly selected, or the viewer only
  // has access to one project to begin with), that project's own Category
  // list is well-defined and the breakdown renders exactly like before,
  // just sourced per-project. When viewing multiple/all projects at once,
  // different projects' categories can use unrelated (or coincidentally
  // colliding) keys, so there's no single meaningful axis to chart them on
  // — deliberately not rendered in that case (see README for the reasoning
  // this was a judgment call, not an oversight).
  const categoryCounts = new Map(categoryGroups.map((g) => [g.category, g._count._all]));
  const categoryProject = activeProject || (projects.length === 1 ? projects[0] : undefined);
  const projectCategories = categoryProject
    ? await prisma.category.findMany({ where: { projectId: categoryProject.id }, orderBy: { order: "asc" } })
    : [];
  const byCategory = projectCategories.map((c) => ({
    name: c.label,
    value: categoryCounts.get(c.key) ?? 0,
  }));

  const avgResolutionHours = resolutionRow[0]?.avgHours ?? 0;

  const slaTotal = Number(slaRow[0]?.total ?? 0);
  const slaWithin = Number(slaRow[0]?.withinSla ?? 0);
  const slaCompliance = slaTotal > 0 ? (slaWithin / slaTotal) * 100 : 100;

  const avgCsat = csatAgg._avg.satisfactionRating;
  const ratedCount = csatAgg._count.satisfactionRating;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-teal">
          التقارير {activeProject ? `— ${activeProject.name}` : scope.isSuperAdmin ? "— كل المشاريع" : "— مشاريعي"}
        </h1>
        <form method="get" className="flex items-center gap-2">
          <select name="projectId" defaultValue={projectId} className="field">
            <option value="">{scope.isSuperAdmin ? "كل المشاريع" : "كل مشاريعي"}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button type="submit" className="btn btn-outline">تصفية</button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="إجمالي التذاكر" value={total.toString()} />
        <StatCard label="متوسط زمن الحل" value={`${avgResolutionHours.toFixed(1)} ساعة`} />
        <StatCard label="نسبة الالتزام بـ SLA" value={`${slaCompliance.toFixed(0)}%`} />
        <StatCard label="تذاكر متأخرة حاليًا" value={currentlyOverdue.toString()} tone={currentlyOverdue > 0 ? "amber" : undefined} />
        <StatCard
          label="متوسط تقييم الرضا"
          value={avgCsat !== null ? `${avgCsat!.toFixed(1)}/5 (${ratedCount} تقييم)` : "لا تقييمات بعد"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-2 text-sm font-bold">التذاكر حسب الحالة</h2>
          <StatusPie data={byStatus} />
        </div>
        <div className="card p-5">
          <h2 className="mb-2 text-sm font-bold">التذاكر حسب التصنيف</h2>
          {categoryProject ? (
            <CategoryBar data={byCategory} />
          ) : (
            <p className="py-8 text-center text-xs text-ink-soft">
              التصنيفات أصبحت خاصة بكل مشروع على حدة — اختر مشروعًا محددًا من القائمة أعلاه لعرض توزيع
              التذاكر حسب تصنيفاته.
            </p>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-2 text-sm font-bold">التذاكر خلال آخر 30 يومًا</h2>
        <TimeSeriesLine data={dailyCounts} />
      </div>
    </div>
  );
}

// 30 small indexed COUNT queries (one per day) rather than a single raw
// SQL GROUP BY on a calendar-day truncation of `createdAt`. SQLite has no
// timezone-aware date bucketing, and `createdAt` is stored as a UTC
// instant — bucketing by UTC calendar day would silently shift ticket
// counts across a day boundary relative to what an agent viewing local
// timestamps elsewhere on this page would expect. Using the exact same
// day-boundary Date objects the old JS `.filter()` version used keeps this
// behaviorally identical, just pushed to the database. Each query hits the
// [projectId, createdAt] composite index directly, so 30 of them is cheap
// — this runs on a low-traffic admin page, not a hot path.
async function dailyCountsLast30Days(scope: ViewerScope, projectFilter: undefined | string | { in: string[] }) {
  const days = 30;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const boundaries = Array.from({ length: days }).map((_, i) => {
    const day = new Date(today);
    day.setDate(day.getDate() - (days - 1 - i));
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    return { day, next };
  });

  const projectWhere: Prisma.TicketWhereInput =
    projectFilter !== undefined ? { projectId: projectFilter as never } : {};

  const counts = await Promise.all(
    boundaries.map(({ day, next }) =>
      prisma.ticket.count({
        where: { ...projectWhere, createdAt: { gte: day, lt: next } },
      })
    )
  );

  return boundaries.map(({ day }, i) => ({
    date: day.toLocaleDateString("ar-SA", { month: "2-digit", day: "2-digit" }),
    count: counts[i],
  }));
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-1 text-2xl font-extrabold" style={{ color: tone === "amber" ? "var(--accent)" : "var(--teal)" }}>
        {value}
      </p>
    </div>
  );
}
