import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getViewerScope } from "@/lib/access";
import CreateProjectForm from "./CreateProjectForm";
import ProjectRow from "./ProjectRow";

export default async function ProjectsPage() {
  const scope = await getViewerScope();
  if (!scope) redirect("/login");
  if (!scope.isSuperAdmin && !scope.permissions.canManageTicketForm) redirect("/dashboard");
  if (!scope.isSuperAdmin && (scope.projectIds || []).length === 0) redirect("/dashboard");

  const projects = await prisma.project.findMany({
    where: scope.isSuperAdmin ? undefined : { id: { in: scope.projectIds || [] } },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { tickets: true } } },
  });

  // ADMIN gets a read-only, scoped list linking into the project edit page
  // (team/ticket-form config); only SUPER_ADMIN gets full branding
  // inline-edit + project creation here.
  if (!scope.isSuperAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-extrabold text-teal">مشاريعي</h1>
          <p className="mt-1 text-sm text-ink-soft">
            المشاريع التي أنت عضو في فريقها. من صفحة كل مشروع يمكنك إدارة إعدادات نموذج التذكرة.
          </p>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[500px] text-sm">
            <thead>
              <tr className="border-b border-border text-right text-ink-soft">
                <th className="p-3">المشروع</th>
                <th className="p-3">المعرّف (slug)</th>
                <th className="p-3">عدد التذاكر</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-bold">{p.name}</td>
                  <td className="p-3" dir="ltr">
                    <Link href={`/${p.slug}`} target="_blank" className="text-teal hover:underline">
                      /{p.slug}
                    </Link>
                  </td>
                  <td className="p-3">{p._count.tickets}</td>
                  <td className="p-3">
                    <Link href={`/dashboard/projects/${p.id}`} className="btn btn-outline text-xs">
                      إدارة المشروع
                    </Link>
                  </td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-ink-soft">
                    لست عضوًا في أي مشروع بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-teal">المشاريع</h1>
        <p className="mt-1 text-sm text-ink-soft">
          إنشاء مشروع جديد يجعل صفحاته العامة (/{"{slug}"}) متاحة فورًا دون الحاجة لأي تعديل في الكود.
        </p>
      </div>

      <CreateProjectForm />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b border-border text-right text-ink-soft">
              <th className="p-3">المشروع</th>
              <th className="p-3">المعرّف (slug)</th>
              <th className="p-3">بادئة التذاكر</th>
              <th className="p-3">اللون</th>
              <th className="p-3">رابط الأسئلة الشائعة</th>
              <th className="p-3">عدد التذاكر</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <ProjectRow
                key={p.id}
                id={p.id}
                name={p.name}
                slug={p.slug}
                ticketPrefix={p.ticketPrefix}
                accentColorHex={p.accentColorHex}
                faqUrl={p.faqUrl}
                ticketCount={p._count.tickets}
              />
            ))}
            {projects.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-ink-soft">
                  لا توجد مشاريع بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
