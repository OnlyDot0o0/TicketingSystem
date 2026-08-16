import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getViewerScope } from "@/lib/access";
import CreateRoleForm from "./CreateRoleForm";
import RoleRow from "./RoleRow";

export default async function RolesPage() {
  const scope = await getViewerScope();
  if (!scope) redirect("/login");
  if (!scope.isSuperAdmin) redirect("/dashboard");

  const roles = await prisma.customRole.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-teal">الأدوار المخصصة</h1>
        <p className="mt-1 text-sm text-ink-soft">
          دور مخصص هو نسخة مسمّاة من أحد الدورين "مدير" أو "موظف دعم"، مع عدد صغير من
          الصلاحيات الإضافية القابلة للتفعيل بشكل مستقل. الأدوار المخصصة محصورة دائمًا بنطاق
          المشروع تمامًا مثل مدير/موظف دعم — لا يمكن لأي دور مخصص أن يكون عامًا على كل
          المشاريع (هذا محصور بالمدير العام فقط).
        </p>
      </div>

      <CreateRoleForm />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border text-right text-ink-soft">
              <th className="p-3">الاسم</th>
              <th className="p-3">الدور الأساسي</th>
              <th className="p-3">إدارة الفريق</th>
              <th className="p-3">إدارة نموذج التذكرة</th>
              <th className="p-3">عرض التقارير</th>
              <th className="p-3">إدارة الردود الجاهزة</th>
              <th className="p-3">عدد المستخدمين</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <RoleRow
                key={r.id}
                id={r.id}
                name={r.name}
                baseRole={r.baseRole}
                canManageTeam={r.canManageTeam}
                canManageTicketForm={r.canManageTicketForm}
                canViewReports={r.canViewReports}
                canManageCannedResponses={r.canManageCannedResponses}
                userCount={r._count.users}
              />
            ))}
            {roles.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-ink-soft">
                  لا توجد أدوار مخصصة بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
