import Link from "next/link";
import { PublicHeader, PublicFooter } from "@/components/PublicShell";
import { getProjectBySlugOr404 } from "@/lib/projects";

export default async function TicketSuccessPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { ticket?: string };
}) {
  const project = await getProjectBySlugOr404(params.slug);
  const ticket = searchParams.ticket;

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader project={project} />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center px-4 py-16 text-center">
        <span className="text-4xl">✅</span>
        <h1 className="mt-4 text-xl font-extrabold" style={{ color: "var(--accent)" }}>
          تم إرسال تذكرتك بنجاح
        </h1>
        <p className="mt-2 text-ink-soft">رقم تذكرتك هو:</p>
        <p className="mt-3 rounded-lg border-2 border-dashed border-accent bg-surface px-6 py-3 text-2xl font-extrabold tracking-widest text-accent" dir="ltr">
          {ticket || "—"}
        </p>
        <p className="mt-4 text-sm font-semibold text-ink">
          احفظ رقم التذكرة — ستحتاجه مع رقم جوالك لمتابعة الحالة لاحقًا.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href={`/${project.slug}/tickets/track`} className="btn btn-primary">
            تتبع التذكرة الآن
          </Link>
          <Link href={`/${project.slug}`} className="btn btn-outline">
            العودة للرئيسية
          </Link>
        </div>
      </main>
      <PublicFooter project={project} />
    </div>
  );
}
