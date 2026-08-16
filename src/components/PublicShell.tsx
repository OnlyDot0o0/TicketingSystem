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
        <nav className="flex items-center gap-3 text-sm">
          <Link href={`/${project.slug}/tickets/track`} className="text-ink-soft hover:text-teal">
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
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 px-4">
        <p>نظام تذاكر الدعم الفني — {project.name}</p>
        <div className="flex gap-4">
          {project.faqUrl && (
            <a href={project.faqUrl} className="hover:text-teal">
              الأسئلة الشائعة
            </a>
          )}
          <Link href="/login" className="hover:text-teal">
            دخول فريق الدعم
          </Link>
        </div>
      </div>
    </footer>
  );
}
