type Attachment = {
  id: string;
  filename: string;
  path: string;
  mimeType: string;
};

type Message = {
  id: string;
  authorType: string;
  authorName: string;
  isInternalNote: boolean;
  body: string;
  createdAt: Date | string;
  attachments?: Attachment[];
};

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleString("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// `href` is required (no default built from `a.path` internally) — every
// call site must explicitly decide how to reach this file. The two valid
// answers are: a plain /api/uploads/... URL for an authenticated staff
// context (the route checks the session itself), or a signed URL from
// signAttachmentUrl() for the public submitter-tracking context (which has
// no session). Forcing this here means a new call site can't accidentally
// fall back to an unprotected link.
export function AttachmentChip({ a, href }: { a: Attachment; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-border bg-bg px-2 py-1 text-xs text-teal hover:underline"
    >
      📎 {a.filename}
    </a>
  );
}

export function MessageThread({
  messages,
  showInternal,
  hrefFor,
}: {
  messages: Message[];
  showInternal: boolean;
  hrefFor: (attachmentPath: string) => string;
}) {
  const visible = showInternal ? messages : messages.filter((m) => !m.isInternalNote);

  if (visible.length === 0) {
    return <p className="text-sm text-ink-soft">لا توجد رسائل بعد.</p>;
  }

  return (
    <div className="space-y-3">
      {visible.map((m) => {
        const isSubmitter = m.authorType === "SUBMITTER";
        return (
          <div
            key={m.id}
            className="rounded-xl border p-3"
            style={{
              borderColor: m.isInternalNote ? "var(--accent)" : "var(--border)",
              background: m.isInternalNote
                ? "color-mix(in srgb, var(--accent) 8%, var(--surface))"
                : isSubmitter
                ? "var(--surface)"
                : "color-mix(in srgb, var(--teal) 6%, var(--surface))",
            }}
          >
            <div className="mb-1 flex items-center justify-between text-xs text-ink-soft">
              <span className="font-bold text-ink">
                {m.authorName} {isSubmitter ? "(مقدّم الطلب)" : "(فريق الدعم)"}
                {m.isInternalNote && (
                  <span className="mr-2 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
                    ملاحظة داخلية
                  </span>
                )}
              </span>
              <span>{fmtDate(m.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink">{m.body}</p>
            {m.attachments && m.attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.attachments.map((a) => (
                  <AttachmentChip key={a.id} a={a} href={hrefFor(a.path)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
