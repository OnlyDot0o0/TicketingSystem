import Link from "next/link";

export type ProjectBranding = {
  slug: string;
  name: string;
  faqUrl: string | null;
};

export function PublicHeader({ project }: { project: ProjectBranding }) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
        <Link href={`/${project.slug}`} className="flex items-center gap-2">
          <span className="text-lg font-bold text-teal">{project.name}</span>
          <span className="text-sm text-ink-soft">مساعدة الدعم الفني</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {/* py-3 gives this plain-text link a ~44px tap target to match the
              button next to it, even though its own text is much shorter —
              mobile contractors are the primary audience for this header. */}
          <Link
            href={`/${project.slug}/tickets/track`}
            className="rounded-lg px-2 py-3 text-ink-soft hover:text-teal"
          >
            تتبع تذكرتك
          </Link>
          <Link href={`/${project.slug}/tickets/new`} className="btn btn-accent">
            افتح تذكرة
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter({ project }: { project: ProjectBranding }) {
  return (
    <footer className="mt-16 border-t border-border py-6 text-center text-xs text-ink-soft">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-1 px-4">
        <p className="py-1">نظام تذاكر الدعم الفني — {project.name}</p>
        {/* py-3 on each link: these were a ~16px-tall text-only tap target
            (just the line height, no padding) — too small to reliably hit
            on a phone. Padding grows the hit area without changing how the
            footer looks visually (still just underlined-on-hover text). */}
        <div className="flex gap-2">
          {project.faqUrl && (
            <a href={project.faqUrl} className="rounded-lg px-2 py-3 hover:text-teal">
              الأسئلة الشائعة
            </a>
          )}
          <Link href="/login" className="rounded-lg px-2 py-3 hover:text-teal">
            دخول فريق الدعم
          </Link>
        </div>
      </div>
    </footer>
  );
}
