import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TotpSettings from "./TotpSettings";

// Reachable by any logged-in staff account, unlike most /dashboard/* pages
// which are project- or permission-scoped — this page only ever touches
// the signed-in user's own account.
export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpEnabled: true },
  });

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-teal">الإعدادات</h1>
        <p className="mt-1 text-sm text-ink-soft">إدارة إعدادات حسابك الشخصي.</p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold">المصادقة الثنائية (2FA)</h2>
        <TotpSettings initialEnabled={user?.totpEnabled ?? false} />
      </div>
    </div>
  );
}
