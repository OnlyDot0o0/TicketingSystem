import Link from "next/link";
import { listActiveProjects } from "@/lib/projects";

// Without this, Next statically prerenders this page at BUILD time (no
// headers()/cookies()/searchParams here to force dynamic rendering
// automatically) — the project list shown to every visitor would then be
// frozen at whatever existed when `next build` last ran, never reflecting
// projects added/removed afterward via the dashboard. Also what broke the
// Docker build entirely: prerendering needs a real, migrated database to
// query at build time, which the Dockerfile's builder stage never has
// (DATABASE_URL is a runtime secret, not something baked into the image) —
// confirmed by reproducing the exact same P2021 "table does not exist"
// crash locally against a fresh, unmigrated database.
export const dynamic = "force-dynamic";

export default async function ProjectDirectoryPage() {
  const projects = await listActiveProjects();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <span className="text-lg font-bold text-teal">مساعدة الدعم الفني</span>
          <Link href="/login" className="text-sm text-ink-soft hover:text-teal">
            دخول فريق الدعم
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold text-teal sm:text-3xl">
          مركز الدعم الفني — اختر مشروعك
        </h1>
        <p className="mt-4 max-w-xl text-ink-soft">
          اختر المشروع الذي ترغب بفتح أو متابعة تذكرة دعم فني بخصوصه.
        </p>

        <div className="mt-10 grid w-full gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/${p.slug}`}
              className="card flex flex-col items-center gap-2 p-8 transition hover:-translate-y-0.5 hover:shadow-md"
              style={{ ["--accent" as string]: p.accentColorHex }}
            >
              <span className="text-lg font-bold" style={{ color: "var(--accent)" }}>
                {p.name}
              </span>
              <span className="text-sm text-ink-soft">افتح صفحة الدعم الفني</span>
            </Link>
          ))}
        </div>

        {projects.length === 0 && (
          <p className="mt-10 text-sm text-ink-soft">لا توجد مشاريع مفعّلة حاليًا.</p>
        )}
      </main>
      <footer className="mt-16 border-t border-border py-6 text-center text-xs text-ink-soft">
        نظام تذاكر الدعم الفني
      </footer>
    </div>
  );
}
