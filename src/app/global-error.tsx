"use client";

// Next.js App Router's root-level error boundary — catches any error that
// escapes every other boundary in the tree (including one thrown from the
// root layout itself), which is why it has to render its own <html>/<body>
// instead of relying on src/app/layout.tsx: when this is active, the root
// layout may be exactly what failed.
//
// (v9) Reports to Sentry via src/lib/sentry.ts, which no-ops (just logs
// locally) until NEXT_PUBLIC_SENTRY_DSN is set — this file works exactly
// the same as before Sentry existed in this codebase when unconfigured.
//
// For a more specific, better-branded fallback within the dashboard
// specifically, see src/app/dashboard/error.tsx — that one catches first
// for anything under /dashboard; this is the last-resort catch-all.
import { useEffect } from "react";
import { captureException } from "@/lib/sentry";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { digest: error.digest, boundary: "global-error" });
  }, [error]);

  return (
    <html dir="rtl" lang="ar">
      <body className="min-h-screen bg-bg text-ink font-arabic antialiased">
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
          <div className="card w-full space-y-3 p-6">
            <p className="text-3xl">⚠️</p>
            <h1 className="text-lg font-bold">حدث خطأ غير متوقع</h1>
            <p className="text-sm text-ink-soft">
              نعتذر عن هذا الخلل. حاول إعادة تحميل الصفحة، وإذا استمرت المشكلة تواصل مع فريق
              الدعم الفني.
            </p>
            <button onClick={() => reset()} className="btn btn-primary w-full">
              إعادة المحاولة
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
