import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Nothing to force — send accounts that already cleared this straight to
  // the dashboard rather than showing a pointless page.
  if (!session.user.mustChangePassword) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-teal">تعيين كلمة مرور جديدة</h1>
        <p className="mt-1 text-sm text-ink-soft">
          هذا حساب جديد تم إنشاؤه لك بكلمة مرور مؤقتة. يجب تعيين كلمة مرور خاصة بك قبل
          المتابعة إلى لوحة التحكم.
        </p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
