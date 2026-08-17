import Link from "next/link";
import { signOut } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/config";
import { getViewerScope } from "@/lib/access";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const scope = await getViewerScope();

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg font-bold text-teal">
              لوحة الدعم
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/dashboard" className="text-ink-soft hover:text-teal">
                التذاكر
              </Link>
              {scope?.isSuperAdmin && (
                <Link href="/dashboard/roles" className="text-ink-soft hover:text-teal">
                  الأدوار المخصصة
                </Link>
              )}
              {scope?.isSuperAdmin && (
                <Link href="/dashboard/audit" className="text-ink-soft hover:text-teal">
                  سجل التدقيق
                </Link>
              )}
              {scope && (scope.isSuperAdmin || scope.permissions.canViewReports) && (
                <Link href="/dashboard/reports" className="text-ink-soft hover:text-teal">
                  التقارير
                </Link>
              )}
              {scope && (scope.isSuperAdmin || scope.permissions.canManageTeam) && (
                <Link href="/dashboard/agents" className="text-ink-soft hover:text-teal">
                  فريق الدعم
                </Link>
              )}
              {scope && (scope.isSuperAdmin || scope.permissions.canManageCannedResponses) && (
                <Link href="/dashboard/canned-responses" className="text-ink-soft hover:text-teal">
                  الردود الجاهزة
                </Link>
              )}
              {scope && (scope.isSuperAdmin || scope.permissions.canManageTicketForm) && (
                <Link href="/dashboard/projects" className="text-ink-soft hover:text-teal">
                  {scope.isSuperAdmin ? "المشاريع" : "مشاريعي"}
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {scope && (
              <Link href="/dashboard/settings" className="text-ink-soft hover:text-teal">
                الإعدادات
              </Link>
            )}
            <span className="text-ink-soft">
              {scope?.name}
              <span className="mr-1 text-xs">
                ({scope?.role === "CUSTOM" ? scope.customRoleName || ROLE_LABELS.CUSTOM : ROLE_LABELS[scope?.role || ""] || scope?.role})
              </span>
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button type="submit" className="btn btn-outline">
                تسجيل الخروج
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
