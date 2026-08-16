import Link from "next/link";
import { PublicHeader, PublicFooter } from "@/components/PublicShell";
import { getProjectBySlugOr404 } from "@/lib/projects";

export default async function ProjectLandingPage({
  params,
}: {
  params: { slug: string };
}) {
  const project = await getProjectBySlugOr404(params.slug);

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader project={project} />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold sm:text-3xl" style={{ color: "var(--accent)" }}>
          نظام تذاكر الدعم الفني لمشروع {project.name}
        </h1>
        <p className="mt-4 max-w-xl text-ink-soft">
          بدلاً من إرسال مشكلتك على مجموعة واتساب، افتح تذكرة دعم هنا وسيتواصل معك فريق
          الدعم الفني في أقرب وقت. يمكنك أيضًا متابعة حالة تذكرتك في أي وقت باستخدام رقم
          التذكرة ورقم جوالك.
        </p>

        <div className="mt-10 grid w-full max-w-2xl gap-4 sm:grid-cols-2">
          <Link
            href={`/${project.slug}/tickets/new`}
            className="card flex flex-col items-center gap-3 p-8 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="text-3xl">📝</span>
            <span className="text-lg font-bold">افتح تذكرة جديدة</span>
            <span className="text-sm text-ink-soft">صف مشكلتك وسنتابعها معك</span>
          </Link>
          <Link
            href={`/${project.slug}/tickets/track`}
            className="card flex flex-col items-center gap-3 p-8 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="text-3xl">🔎</span>
            <span className="text-lg font-bold">تتبع تذكرتك</span>
            <span className="text-sm text-ink-soft">تابع حالة تذكرة سابقة وأضف ردودًا</span>
          </Link>
        </div>

        {project.faqUrl && (
          <p className="mt-10 text-sm text-ink-soft">
            قبل فتح تذكرة، قد تجد إجابة سؤالك جاهزة في{" "}
            <a href={project.faqUrl} className="font-semibold underline" style={{ color: "var(--accent)" }}>
              صفحة الأسئلة الشائعة
            </a>
            .
          </p>
        )}
      </main>
      <PublicFooter project={project} />
    </div>
  );
}
