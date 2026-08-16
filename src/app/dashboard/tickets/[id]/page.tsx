import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getViewerScope, canAccessProject } from "@/lib/access";
import { StatusBadge, PriorityBadge, CategoryBadge, OverdueBadge } from "@/components/Badges";
import { MessageThread, AttachmentChip } from "@/components/MessageThread";
import { isOverdue } from "@/lib/sla";
import TicketControls from "./TicketControls";
import AgentReplyForm from "./AgentReplyForm";
import TagsSection from "./TagsSection";
import ActivityTimeline from "./ActivityTimeline";
import CustomFieldsSection from "./CustomFieldsSection";

export default async function TicketDetailPage({ params }: { params: { id: string } }) {
  const scope = await getViewerScope();
  if (!scope) redirect("/login");

  const ticket = await prisma.ticket.findUnique({
    where: { id: params.id },
    include: {
      messages: { orderBy: { createdAt: "asc" }, include: { attachments: true } },
      attachments: true,
      assignedTo: true,
      project: true,
      tags: { include: { tag: true } },
      activities: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!ticket) notFound();
  if (!canAccessProject(scope, ticket.projectId)) notFound();

  const [agents, projectTags, cannedResponses, customFields] = await Promise.all([
    scope.isSuperAdmin
      ? prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } })
      : prisma.user.findMany({
          where: { active: true, memberships: { some: { projectId: ticket.projectId } } },
          orderBy: { name: "asc" },
        }),
    prisma.tag.findMany({ where: { projectId: ticket.projectId }, orderBy: { name: "asc" } }),
    prisma.cannedResponse.findMany({ where: { projectId: ticket.projectId }, orderBy: { title: "asc" } }),
    prisma.customField.findMany({ where: { projectId: ticket.projectId }, orderBy: { order: "asc" } }),
  ]);

  const fieldValueByFieldId = new Map(
    (await prisma.ticketFieldValue.findMany({ where: { ticketId: ticket.id } })).map((v) => [v.customFieldId, v.value])
  );
  const fieldsWithValues = customFields.map((f) => ({
    id: f.id,
    label: f.label,
    fieldType: f.fieldType,
    required: f.required,
    options: f.options,
    value: fieldValueByFieldId.get(f.id) ?? null,
  }));

  const rootAttachments = ticket.attachments.filter((a) => !a.messageId);
  const overdue = isOverdue(ticket.slaDueAt, ticket.status);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <div className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs text-ink-soft" dir="ltr">{ticket.ticketNumber}</p>
              <h1 className="text-lg font-bold">{ticket.subject}</h1>
              <span
                className="badge mt-1"
                style={{ borderColor: ticket.project.accentColorHex, color: ticket.project.accentColorHex }}
              >
                {ticket.project.name}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              <CategoryBadge category={ticket.category} />
              {overdue && <OverdueBadge />}
            </div>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{ticket.description}</p>
          {ticket.satisfactionRating !== null && (
            <p className="mt-2 text-sm text-ink-soft">
              تقييم الرضا:{" "}
              <span className="font-bold text-teal">
                {"⭐".repeat(ticket.satisfactionRating)} ({ticket.satisfactionRating}/5)
              </span>
              {ticket.satisfactionSubmittedAt && (
                <span className="mr-2 text-xs" dir="ltr">
                  {new Date(ticket.satisfactionSubmittedAt).toLocaleString("ar-SA")}
                </span>
              )}
            </p>
          )}
          {rootAttachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {rootAttachments.map((a) => (
                // Plain URL — this is an authenticated staff page, the
                // /api/uploads route checks the session + project access
                // itself. No signed token needed here.
                <AttachmentChip key={a.id} a={a} href={`/api/uploads/${a.path}`} />
              ))}
            </div>
          )}
          <div className="mt-4 border-t border-border pt-3">
            <TagsSection
              ticketId={ticket.id}
              currentTags={ticket.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, colorHex: t.tag.colorHex }))}
              projectTags={projectTags.map((t) => ({ id: t.id, name: t.name, colorHex: t.colorHex }))}
            />
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-bold">سجل المحادثة</h2>
          <MessageThread messages={ticket.messages} showInternal hrefFor={(p) => `/api/uploads/${p}`} />
          <AgentReplyForm
            ticketId={ticket.id}
            cannedResponses={cannedResponses.map((c) => ({ id: c.id, title: c.title, body: c.body }))}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-bold">إدارة التذكرة</h2>
          <TicketControls
            ticketId={ticket.id}
            status={ticket.status}
            priority={ticket.priority}
            category={ticket.category}
            assignedToId={ticket.assignedToId}
            agents={agents}
            currentUserId={scope.userId}
          />
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-bold">بيانات مقدّم الطلب</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-soft">الاسم</dt>
              <dd>{ticket.submitterName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">الجوال</dt>
              <dd dir="ltr">{ticket.submitterPhone}</dd>
            </div>
            {ticket.submitterEmail && (
              <div className="flex justify-between">
                <dt className="text-ink-soft">البريد</dt>
                <dd dir="ltr">{ticket.submitterEmail}</dd>
              </div>
            )}
            {ticket.contractNumber && (
              <div className="flex justify-between">
                <dt className="text-ink-soft">رقم العقد</dt>
                <dd dir="ltr">{ticket.contractNumber}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-ink-soft">تاريخ الإنشاء</dt>
              <dd dir="ltr">{new Date(ticket.createdAt).toLocaleString("ar-SA")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">موعد SLA</dt>
              <dd dir="ltr">{new Date(ticket.slaDueAt).toLocaleString("ar-SA")}</dd>
            </div>
          </dl>
        </div>

        {fieldsWithValues.length > 0 && (
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-bold">بيانات إضافية</h2>
            <CustomFieldsSection ticketId={ticket.id} fields={fieldsWithValues} />
          </div>
        )}

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-bold">سجل النشاط</h2>
          <ActivityTimeline activities={ticket.activities} />
        </div>
      </div>
    </div>
  );
}
