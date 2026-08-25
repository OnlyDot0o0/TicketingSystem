import Link from "next/link";
import LoginForm from "./LoginForm";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string };
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4">
      <div className="mb-6 text-center">
        <Link href="/" className="text-lg font-bold text-teal">مساعدة الدعم الفني</Link>
        <p className="text-sm text-ink-soft">دخول فريق الدعم الفني</p>
      </div>
      <div className="w-full max-w-sm">
        <LoginForm callbackUrl={searchParams.callbackUrl || "/dashboard"} />
      </div>
      <Link href="/" className="mt-6 text-sm text-ink-soft hover:text-teal">
        العودة للصفحة الرئيسية
      </Link>
    </div>
  );
}
