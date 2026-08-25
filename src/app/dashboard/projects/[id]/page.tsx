import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getViewerScope, canAccessProject } from "@/lib/access";
import { ROLE_LABELS } from "@/lib/config";
import TicketFormConfigForm from "./TicketFormConfigForm";
import AddMemberForm from "./AddMemberForm";
import RemoveMemberButton from "./RemoveMemberButton";
import CustomFieldsManager from "./CustomFieldsManager";
import CategoriesManager from "./CategoriesManager";
import SlaConfigForm from "./SlaConfigForm";

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const scope = await getViewerScope();
  if (!scope) redirect("/login");
  if (!scope.isSuperAdmin && !scope.permissions.canManageTicketForm) redirect("/dashboard");
  if (!canAccessProject(scope, params.id)) notFound();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      memberships: { include: { user: { include: { customRole: true } } }, orderBy: { createdAt: "asc" } },
      _count: { select: { tickets: true } },
      customFields: { orderBy: { order: "asc" } },
      categories: { orderBy: { order: "asc" } },
    },
  });
  if (!project) notFound();

  const memberUserIds = new Set(project.memberships.map((m) => m.userId));
  const candidateUsers = scope.isSuperAdmin
    ? await prisma.user.findMany({
        where: { active: true, id: { notIn: Array.from(memberUserIds) } },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/dashboard/projects" className="text-xs text-ink-soft hover:text-teal">
            ← المشاريع
          </Link>
          <h1 className="text-xl font-extrabold text-teal">{project.name}</h1>
        </div>
        <span className="badge" style={{ borderColor: project.accentColorHex, color: project.accentColorHex }}>
          /{project.slug} — {project.ticketPrefix}
        </span>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-bold">معلومات المشروع</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between border-b border-border py-1">
            <dt className="text-ink-soft">الاسم</dt>
            <dd>{project.name}</dd>
          </div>
          <div className="flex justify-between border-b border-border py-1">
            <dt className="text-ink-soft">المعرّف</dt>
            <dd dir="ltr">/{project.slug}</dd>
          </div>
          <div className="flex justify-between border-b border-border py-1">
            <dt className="text-ink-soft">بادئة التذاكر</dt>
            <dd dir="ltr">{project.ticketPrefix}</dd>
          </div>
          <div className="flex justify-between border-b border-border py-1">
            <dt className="text-ink-soft">عدد التذاكر</dt>
            <dd>{project._count.tickets}</dd>
          </div>
        </dl>
        {scope.isSuperAdmin && (
          <p className="mt-3 text-xs text-ink-soft">
            لتعديل الاسم/اللون/رابط الأسئلة الشائعة/بادئة التذاكر، استخدم زر "تعديل" في{" "}
            <Link href="/dashboard/projects" className="text-teal hover:underline">قائمة المشاريع</Link>.
          </p>
        )}
      </div>

      <div className="card p-5">
        <h2 className="mb-1 text-sm font-bold">نموذج التذكرة</h2>
        <p className="mb-3 text-xs text-ink-soft">
          تحكّم في الحقول التي تظهر في نموذج فتح تذكرة جديدة العام لهذا المشروع
          (/{project.slug}/tickets/new). التصنيف والأولوية لا يمكن إخفاؤهما لأنهما يحددان التوجيه
          ومهلة الاستجابة (SLA) — إن تُركا اختياريين وتم تجاهلهما، يُطبَّق تلقائيًا تصنيف
          "أخرى" وأولوية "متوسطة".
        </p>
        <TicketFormConfigForm
          projectId={project.id}
          emailMode={project.emailMode}
          contractNumberMode={project.contractNumberMode}
          categoryMode={project.categoryMode}
          priorityMode={project.priorityMode}
          attachmentsMode={project.attachmentsMode}
        />
      </div>

      <div className="card p-5">
        <h2 className="mb-1 text-sm font-bold">حقول مخصصة</h2>
        <p className="mb-3 text-xs text-ink-soft">
          حقول إضافية خاصة بهذا المشروع تظهر في نموذج فتح التذكرة العام بعد الحقول الأساسية،
          بالترتيب المحدد أدناه. القيم المُدخلة تظهر لاحقًا في صفحة تفاصيل التذكرة ويمكن لأي عضو
          في فريق المشروع تعديلها.
        </p>
        <CustomFieldsManager
          projectId={project.id}
          fields={project.customFields.map((f) => ({
            id: f.id,
            key: f.key,
            label: f.label,
            fieldType: f.fieldType,
            required: f.required,
            options: f.options,
            order: f.order,
          }))}
        />
      </div>

      <div className="card p-5">
        <h2 className="mb-1 text-sm font-bold">تصنيفات التذاكر</h2>
        <p className="mb-3 text-xs text-ink-soft">
          تصنيفات المشكلة الخاصة بهذا المشروع، تظهر في نموذج فتح تذكرة جديدة العام وفي صفحات إدارة
          التذاكر. لا يمكن حذف تصنيف مستخدم في أي تذكرة حاليًا، ولا يمكن حذف آخر تصنيف متبقٍ في
          المشروع.
        </p>
        <CategoriesManager
          projectId={project.id}
          categories={project.categories.map((c) => ({ id: c.id, key: c.key, label: c.label, order: c.order }))}
        />
      </div>

      <div className="card p-5">
        <h2 className="mb-1 text-sm font-bold">مهلة الاستجابة (SLA)</h2>
        <p className="mb-3 text-xs text-ink-soft">
          الوقت المستهدف للاستجابة لكل مستوى أولوية في هذا المشروع. الأولوية "عاجلة" بالساعات
          (زمن حقيقي)، وباقي المستويات بأيام العمل (الجمعة والسبت عطلة).
        </p>
        <SlaConfigForm
          projectId={project.id}
          slaUrgentHours={project.slaUrgentHours}
          slaHighDays={project.slaHighDays}
          slaMediumDays={project.slaMediumDays}
          slaLowDays={project.slaLowDays}
        />
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-bold">فريق المشروع</h2>
        <div className="mb-4 overflow-x-auto">
          <table className="w-full min-w-[400px] text-sm">
            <thead>
              <tr className="border-b border-border text-right text-ink-soft">
                <th className="p-2">الاسم</th>
                <th className="p-2">البريد الإلكتروني</th>
                <th className="p-2">الدور</th>
                {scope.isSuperAdmin && <th className="p-2"></th>}
              </tr>
            </thead>
            <tbody>
              {project.memberships.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="p-2">{m.user.name}</td>
                  <td className="p-2" dir="ltr">{m.user.email}</td>
                  <td className="p-2">
                    {m.user.role === "CUSTOM" ? m.user.customRole?.name || ROLE_LABELS.CUSTOM : ROLE_LABELS[m.user.role] || m.user.role}
                  </td>
                  {scope.isSuperAdmin && (
                    <td className="p-2">
                      <RemoveMemberButton projectId={project.id} userId={m.userId} />
                    </td>
                  )}
                </tr>
              ))}
              {project.memberships.length === 0 && (
                <tr>
                  <td colSpan={scope.isSuperAdmin ? 4 : 3} className="p-4 text-center text-ink-soft">
                    لا يوجد أعضاء في فريق هذا المشروع بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {scope.isSuperAdmin ? (
          <AddMemberForm projectId={project.id} candidateUsers={candidateUsers.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }))} />
        ) : (
          <p className="text-xs text-ink-soft">
            إضافة/إزالة أعضاء الفريق متاحة للمدير العام فقط. لإضافة موظف دعم جديد لهذا المشروع، استخدم صفحة{" "}
            <Link href="/dashboard/agents" className="text-teal hover:underline">فريق الدعم</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
