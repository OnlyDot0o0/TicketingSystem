import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getViewerScope } from "@/lib/access";

// Local to this page, same as ActivityTimeline.tsx keeps its own
// ACTION_LABELS rather than centralizing every activity-log label map in
// src/lib/config.ts.
const ACTION_LABELS: Record<string, string> = {
  PROJECT_CREATED: "إنشاء مشروع",
  PROJECT_BRANDING_UPDATED: "تعديل بيانات مشروع",
  PROJECT_TICKET_FORM_UPDATED: "تعديل نموذج تذكرة المشروع",
  PROJECT_MEMBER_ADDED: "إضافة عضو لمشروع",
  PROJECT_MEMBER_REMOVED: "إزالة عضو من مشروع",
  ROLE_CREATED: "إنشاء دور مخصص",
  ROLE_UPDATED: "تعديل دور مخصص",
  ROLE_DELETED: "حذف دور مخصص",
  AGENT_CREATED: "إنشاء حساب موظف",
  AGENT_ROLE_CHANGED: "تغيير دور موظف",
  AGENT_ACTIVATED: "تفعيل حساب موظف",
  AGENT_DEACTIVATED: "تعطيل حساب موظف",
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  PROJECT: "مشروع",
  ROLE: "دور مخصص",
  AGENT: "حساب موظف",
};

const MAX_ROWS = 200;

function fmtDate(d: Date) {
  return new Date(d).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { action?: string };
}) {
  const scope = await getViewerScope();
  if (!scope) redirect("/login");
  if (!scope.isSuperAdmin) redirect("/dashboard");

  const action = searchParams.action || undefined;

  const activities = await prisma.adminActivity.findMany({
    where: action ? { action } : undefined,
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-teal">سجل التدقيق</h1>
        <p className="mt-1 text-sm text-ink-soft">
          سجل الإجراءات الإدارية (المشاريع، الأدوار المخصصة، فريق الدعم) — للمدير العام فقط.
          يعرض آخر {MAX_ROWS} إجراء، الأحدث أولًا.
        </p>
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-4" method="get">
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor="action">نوع الإجراء</label>
          <select id="action" name="action" defaultValue={action || ""} className="field">
            <option value="">كل الإجراءات</option>
            {Object.entries(ACTION_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary">تصفية</button>
        <Link href="/dashboard/audit" className="btn btn-outline">مسح</Link>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[850px] text-sm">
          <thead>
            <tr className="border-b border-border text-right text-ink-soft">
              <th className="p-3">التاريخ</th>
              <th className="p-3">المستخدم</th>
              <th className="p-3">الإجراء</th>
              <th className="p-3">نوع الهدف</th>
              <th className="p-3">الهدف</th>
              <th className="p-3">التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap p-3 text-xs" dir="ltr">{fmtDate(a.createdAt)}</td>
                <td className="p-3 font-bold">{a.actorName}</td>
                <td className="p-3">{ACTION_LABELS[a.action] || a.action}</td>
                <td className="p-3">{TARGET_TYPE_LABELS[a.targetType] || a.targetType}</td>
                <td className="p-3">{a.targetLabel}</td>
                <td className="p-3 text-xs">
                  {a.fromValue && a.toValue ? (
                    <>
                      <span className="font-semibold">{a.fromValue}</span> ← <span className="font-semibold">{a.toValue}</span>
                    </>
                  ) : a.toValue ? (
                    <span className="font-semibold">{a.toValue}</span>
                  ) : a.fromValue ? (
                    <span className="font-semibold">{a.fromValue}</span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {activities.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ink-soft">
                  لا يوجد نشاط بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
