import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getViewerScope } from "@/lib/access";
import { ROLE_LABELS } from "@/lib/config";
import AccountInfoForm from "./AccountInfoForm";
import PasswordSettings from "./PasswordSettings";

// Reachable by any logged-in staff account, unlike most /dashboard/* pages
// which are project- or permission-scoped — this page only ever touches
// the signed-in user's own account.
export default async function SettingsPage() {
  const scope = await getViewerScope();
  if (!scope) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: scope.userId },
    select: { name: true, email: true },
  });
  if (!user) redirect("/login");

  // Same role-label resolution as the dashboard nav's "أنت" label
  // (src/app/dashboard/layout.tsx) — kept in sync rather than duplicated
  // ad hoc, since a CUSTOM role's display name isn't in ROLE_LABELS at all.
  const roleLabel =
    scope.role === "CUSTOM" ? scope.customRoleName || ROLE_LABELS.CUSTOM : ROLE_LABELS[scope.role] || scope.role;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-teal">الإعدادات</h1>
        <p className="mt-1 text-sm text-ink-soft">إدارة إعدادات حسابك الشخصي.</p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold">معلومات الحساب</h2>
        <AccountInfoForm initialName={user.name} initialEmail={user.email} roleLabel={roleLabel} />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold">كلمة المرور</h2>
        <PasswordSettings />
      </div>
    </div>
  );
}
