"use client";

// Route-segment error boundary scoped to everything under /dashboard — the
// internal support-team app. Catches errors thrown while rendering any
// dashboard page/layout (including ones surfaced from a Server Action's
// render pass, e.g. an unhandled exception inside a server action handler)
// without tearing down the rest of the app the way src/app/global-error.tsx
// (the root, last-resort boundary) would; the public ticket-submission
// pages, login, etc. are unaffected by an error here.
//
// (v9) Reports to Sentry via src/lib/sentry.ts, which no-ops (just logs
// locally) until NEXT_PUBLIC_SENTRY_DSN is set.
import { useEffect } from "react";
import { captureException } from "@/lib/sentry";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { digest: error.digest, boundary: "dashboard/error" });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="card w-full space-y-3 p-6">
        <p className="text-3xl">⚠️</p>
        <h1 className="text-lg font-bold">حدث خطأ في لوحة التحكم</h1>
        <p className="text-sm text-ink-soft">
          نعتذر عن هذا الخلل. جرّب إعادة المحاولة، وإذا استمرت المشكلة تواصل مع الدعم الفني.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button onClick={() => reset()} className="btn btn-primary">
            إعادة المحاولة
          </button>
          <a href="/dashboard" className="btn btn-outline">
            العودة لقائمة التذاكر
          </a>
        </div>
      </div>
    </div>
  );
}
