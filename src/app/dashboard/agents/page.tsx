import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getViewerScope } from "@/lib/access";
import CreateAgentForm from "./CreateAgentForm";
import AgentRow from "./AgentRow";

export default async function AgentsPage() {
  const scope = await getViewerScope();
  if (!scope) redirect("/login");
  if (!scope.isSuperAdmin && !scope.permissions.canManageTeam) {
    redirect("/dashboard");
  }
  if (!scope.isSuperAdmin && (scope.projectIds || []).length === 0) {
    redirect("/dashboard");
  }

  const projects = await prisma.project.findMany({ orderBy: { name: "asc" } });
  const assignableProjects = scope.isSuperAdmin
    ? projects
    : projects.filter((p) => (scope.projectIds || []).includes(p.id));
  const customRoles = await prisma.customRole.findMany({ orderBy: { name: "asc" } });

  // SUPER_ADMIN sees every user. ADMIN/CUSTOM(canManageTeam) sees only
  // users who share membership in at least one of the viewer's own
  // projects, plus itself.
  const users = scope.isSuperAdmin
    ? await prisma.user.findMany({
        orderBy: { createdAt: "asc" },
        include: { memberships: { include: { project: true } }, customRole: true },
      })
    : await prisma.user.findMany({
        where: {
          OR: [
            { id: scope.userId },
            { memberships: { some: { projectId: { in: scope.projectIds || [] } } } },
          ],
        },
        orderBy: { createdAt: "asc" },
        include: { memberships: { include: { project: true } }, customRole: true },
      });

  const viewerCanAssignRoles = scope.isSuperAdmin || scope.permissions.canManageTeam;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-extrabold text-teal">فريق الدعم</h1>
      <CreateAgentForm
        isSuperAdmin={scope.isSuperAdmin}
        customRoles={customRoles.map((r) => ({ id: r.id, name: r.name }))}
        assignableProjects={assignableProjects.map((p) => ({ id: p.id, name: p.name }))}
      />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[750px] text-sm">
          <thead>
            <tr className="border-b border-border text-right text-ink-soft">
              <th className="p-3">الاسم</th>
              <th className="p-3">البريد الإلكتروني</th>
              <th className="p-3">الدور</th>
              <th className="p-3">المشاريع</th>
              <th className="p-3">الحالة</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <AgentRow
                key={u.id}
                id={u.id}
                name={u.name}
                email={u.email}
                role={u.role}
                customRoleId={u.customRoleId}
                customRoleName={u.customRole?.name || null}
                active={u.active}
                isSelf={u.id === scope.userId}
                viewerCanAssignRoles={viewerCanAssignRoles}
                viewerIsSuperAdmin={scope.isSuperAdmin}
                customRoles={customRoles.map((r) => ({ id: r.id, name: r.name }))}
                projectNames={u.memberships.map((m) => m.project.name)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
