import { prisma } from "@/lib/prisma";
import { getProjectBySlugOr404 } from "@/lib/projects";
import { PublicHeader, PublicFooter } from "@/components/PublicShell";
import { StatusBadge, PriorityBadge, CategoryBadge } from "@/components/Badges";
import { MessageThread, AttachmentChip } from "@/components/MessageThread";
import ReplyForm from "./ReplyForm";
import { isOverdue } from "@/lib/sla";
import { signAttachmentUrl } from "@/lib/attachmentAccess";
import { categoryLabel } from "@/lib/categories";

export default async function TrackTicketPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { ticketNumber?: string; phone?: string };
}) {
  const project = await getProjectBySlugOr404(params.slug);
  const ticketNumber = searchParams.ticketNumber?.trim();
  const phone = searchParams.phone?.trim();

  let ticket: Awaited<ReturnType<typeof lookup>> = null;
  let notFound = false;

  if (ticketNumber && phone) {
    ticket = await lookup(project.id, ticketNumber, phone);
    if (!ticket) notFound = true;
  }

  const categories = ticket
    ? await prisma.category.findMany({ where: { projectId: project.id }, select: { key: true, label: true } })
    : [];

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader project={project} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <h1 className="mb-1 text-xl font-extrabold" style={{ color: "var(--accent)" }}>
          تتبع تذكرتك — {project.name}
        </h1>
        <p className="mb-6 text-sm text-ink-soft">
          أدخل رقم التذكرة ورقم الجوال المستخدم عند فتح التذكرة.
        </p>

        <form action={`/${project.slug}/tickets/track`} method="get" className="card mb-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="label" htmlFor="ticketNumber">رقم التذكرة</label>
            <input
              id="ticketNumber"
              name="ticketNumber"
              defaultValue={ticketNumber}
              placeholder={`${project.ticketPrefix}-000123`}
              dir="ltr"
              className="field"
              required
            />
          </div>
          <div className="flex-1">
            <label className="label" htmlFor="phone">رقم الجوال</label>
            <input
              id="phone"
              name="phone"
              defaultValue={phone}
              dir="ltr"
              className="field"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary">
            بحث
          </button>
        </form>

        {notFound && (
          <div className="card border-red-300 bg-red-50 p-4 text-sm text-red-700">
            لم يتم العثور على تذكرة مطابقة لرقم التذكرة والجوال المدخلين.
          </div>
        )}

        {ticket && (
          <div className="card space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs text-ink-soft" dir="ltr">{ticket.ticketNumber}</p>
                <h2 className="text-lg font-bold">{ticket.subject}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
                <CategoryBadge category={ticket.category} label={categoryLabel(categories, ticket.category)} />
                {isOverdue(ticket.slaDueAt, ticket.status) && (
                  <span className="badge" style={{ borderColor: "#c8322d", color: "#c8322d" }}>
                    متأخرة
                  </span>
                )}
              </div>
            </div>

            <p className="whitespace-pre-wrap text-sm text-ink">{ticket.description}</p>

            {ticket.attachments.filter((a) => !a.messageId).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {ticket.attachments
                  .filter((a) => !a.messageId)
                  .map((a) => (
                    // No session on this public page — signed, time-limited
                    // URL instead (see src/lib/attachmentAccess.ts). The
                    // submitter already proved ticket ownership via
                    // ticketNumber+phone to reach this page at all.
                    <AttachmentChip key={a.id} a={a} href={signAttachmentUrl(a.path)} />
                  ))}
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-bold">سجل المحادثة</h3>
              <MessageThread messages={ticket.messages} showInternal={false} hrefFor={signAttachmentUrl} />
            </div>

            <ReplyForm slug={project.slug} ticketNumber={ticket.ticketNumber} submitterPhone={ticket.submitterPhone} />
          </div>
        )}
      </main>
      <PublicFooter project={project} />
    </div>
  );
}

async function lookup(projectId: string, ticketNumber: string, phone: string) {
  return prisma.ticket.findFirst({
    where: { projectId, ticketNumber, submitterPhone: phone },
    include: {
      messages: { orderBy: { createdAt: "asc" }, include: { attachments: true } },
      attachments: true,
    },
  });
}
