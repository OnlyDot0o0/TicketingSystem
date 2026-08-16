import Link from "next/link";
import ResetPasswordForm from "./ResetPasswordForm";

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token || "";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4">
      <div className="mb-6 text-center">
        <Link href="/" className="text-lg font-bold text-teal">مساعدة الدعم الفني</Link>
        <p className="text-sm text-ink-soft">تعيين كلمة مرور جديدة</p>
      </div>
      <div className="w-full max-w-sm">
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="card p-6 text-sm text-red-700">رابط غير صالح — لا يوجد رمز إعادة تعيين.</div>
        )}
      </div>
      <Link href="/login" className="mt-6 text-sm text-ink-soft hover:text-teal">
        العودة لتسجيل الدخول
      </Link>
    </div>
  );
}
