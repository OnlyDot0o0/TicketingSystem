import Link from "next/link";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4">
      <div className="mb-6 text-center">
        <Link href="/" className="text-lg font-bold text-teal">مساعدة الدعم الفني</Link>
        <p className="text-sm text-ink-soft">استعادة كلمة المرور</p>
      </div>
      <div className="w-full max-w-sm">
        <ForgotPasswordForm />
      </div>
      <Link href="/login" className="mt-6 text-sm text-ink-soft hover:text-teal">
        العودة لتسجيل الدخول
      </Link>
    </div>
  );
}
