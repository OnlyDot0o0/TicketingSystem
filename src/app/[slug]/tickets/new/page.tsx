import { PublicHeader, PublicFooter } from "@/components/PublicShell";
import { getProjectBySlugOr404 } from "@/lib/projects";
import { getCaptchaConfig } from "@/lib/captcha";
import { prisma } from "@/lib/prisma";
import NewTicketForm from "./NewTicketForm";

export default async function NewTicketPage({
  params,
}: {
  params: { slug: string };
}) {
  const project = await getProjectBySlugOr404(params.slug);
  const captcha = getCaptchaConfig();
  const [customFields, categories] = await Promise.all([
    prisma.customField.findMany({ where: { projectId: project.id }, orderBy: { order: "asc" } }),
    prisma.category.findMany({ where: { projectId: project.id }, orderBy: { order: "asc" } }),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader project={project} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <h1 className="mb-1 text-xl font-extrabold" style={{ color: "var(--accent)" }}>
          افتح تذكرة جديدة — {project.name}
        </h1>
        <p className="mb-6 text-sm text-ink-soft">
          صف مشكلتك بالتفصيل وسنقوم بالرد عليك في أقرب وقت ممكن. سيتم إعطاؤك رقم تذكرة
          احتفظ به لمتابعة الحالة.
        </p>
        <NewTicketForm
          slug={project.slug}
          captcha={captcha}
          config={{
            emailMode: project.emailMode as never,
            contractNumberMode: project.contractNumberMode as never,
            categoryMode: project.categoryMode as never,
            priorityMode: project.priorityMode as never,
            attachmentsMode: project.attachmentsMode as never,
          }}
          categories={categories.map((c) => ({ key: c.key, label: c.label }))}
          customFields={customFields.map((f) => ({
            id: f.id,
            key: f.key,
            label: f.label,
            fieldType: f.fieldType,
            required: f.required,
            options: f.options,
          }))}
        />
      </main>
      <PublicFooter project={project} />
    </div>
  );
}
