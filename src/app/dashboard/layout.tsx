import Link from "next/link";
import { signOut } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/config";
import { getViewerScope } from "@/lib/access";
import { DashboardNav, DashboardNavItem } from "@/components/DashboardNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const scope = await getViewerScope();

  // Built once here (same visibility rules as before) and handed to the
  // client-side DashboardNav, which renders it two ways: inline on desktop,
  // behind a hamburger panel on mobile — see DashboardNav.tsx for why.
  const navItems: DashboardNavItem[] = [{ href: "/dashboard", label: "التذاكر" }];
  if (scope?.isSuperAdmin) {
    navItems.push({ href: "/dashboard/roles", label: "الأدوار المخصصة" });
    navItems.push({ href: "/dashboard/audit", label: "سجل التدقيق" });
  }
  if (scope && (scope.isSuperAdmin || scope.permissions.canViewReports)) {
    navItems.push({ href: "/dashboard/reports", label: "التقارير" });
  }
  if (scope && (scope.isSuperAdmin || scope.permissions.canManageTeam)) {
    navItems.push({ href: "/dashboard/agents", label: "فريق الدعم" });
  }
  if (scope && (scope.isSuperAdmin || scope.permissions.canManageCannedResponses)) {
    navItems.push({ href: "/dashboard/canned-responses", label: "الردود الجاهزة" });
  }
  if (scope && (scope.isSuperAdmin || scope.permissions.canManageTicketForm)) {
    navItems.push({ href: "/dashboard/projects", label: scope.isSuperAdmin ? "المشاريع" : "مشاريعي" });
  }

  const userLabel = `${scope?.name} (${
    scope?.role === "CUSTOM" ? scope.customRoleName || ROLE_LABELS.CUSTOM : ROLE_LABELS[scope?.role || ""] || scope?.role
  })`;

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="relative border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/dashboard" className="text-lg font-bold text-teal">
            لوحة الدعم
          </Link>
          {scope && (
            <DashboardNav
              navItems={navItems}
              settingsHref="/dashboard/settings"
              userLabel={userLabel}
              signOutAction={signOutAction}
            />
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
