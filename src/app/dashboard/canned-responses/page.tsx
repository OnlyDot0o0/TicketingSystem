import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getViewerScope } from "@/lib/access";
import CreateCannedResponseForm from "./CreateCannedResponseForm";
import CannedResponseRow from "./CannedResponseRow";

export default async function CannedResponsesPage() {
  const scope = await getViewerScope();
  if (!scope) redirect("/login");
  if (!scope.isSuperAdmin && !scope.permissions.canManageCannedResponses) redirect("/dashboard");
  if (!scope.isSuperAdmin && (scope.projectIds || []).length === 0) redirect("/dashboard");

  const projects = await prisma.project.findMany({
    where: scope.isSuperAdmin ? undefined : { id: { in: scope.projectIds || [] } },
    orderBy: { name: "asc" },
  });

  const cannedResponses = await prisma.cannedResponse.findMany({
    where: scope.isSuperAdmin ? undefined : { projectId: { in: scope.projectIds || [] } },
    include: { project: true },
    orderBy: [{ projectId: "asc" }, { title: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-teal">الردود الجاهزة</h1>
        <p className="mt-1 text-sm text-ink-soft">
          ردود قابلة لإعادة الاستخدام، يمكن لأي موظف دعم أو مدير لديه صلاحية على المشروع إدراجها
          في مربع الرد داخل صفحة التذكرة.
        </p>
      </div>

      <CreateCannedResponseForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-border text-right text-ink-soft">
              <th className="p-3">المشروع</th>
              <th className="p-3">العنوان</th>
              <th className="p-3">النص</th>
              <th className="p-3">أنشأه</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {cannedResponses.map((c) => (
              <CannedResponseRow
                key={c.id}
                id={c.id}
                projectName={c.project.name}
                title={c.title}
                body={c.body}
                createdBy={c.createdBy}
              />
            ))}
            {cannedResponses.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink-soft">
                  لا توجد ردود جاهزة بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
