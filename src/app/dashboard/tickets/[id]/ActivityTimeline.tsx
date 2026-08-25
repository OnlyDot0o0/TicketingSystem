type Activity = {
  id: string;
  actorName: string;
  action: string;
  fromValue: string | null;
  toValue: string | null;
  createdAt: Date | string;
};

const ACTION_LABELS: Record<string, string> = {
  STATUS_CHANGED: "غيّر الحالة",
  PRIORITY_CHANGED: "غيّر الأولوية",
  CATEGORY_CHANGED: "غيّر التصنيف",
  ASSIGNED: "غيّر الإسناد",
  TAG_ADDED: "أضاف وسم",
  TAG_REMOVED: "أزال وسم",
};

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
}

export default function ActivityTimeline({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return <p className="text-xs text-ink-soft">لا توجد أحداث بعد.</p>;
  }

  return (
    <ol className="space-y-3 border-r-2 border-border pr-3">
      {activities.map((a) => (
        <li key={a.id} className="relative text-xs">
          <span
            className="absolute top-1 -right-[17px] h-2 w-2 rounded-full"
            style={{ background: "var(--accent)" }}
          />
          <p className="text-ink">
            <span className="font-bold">{a.actorName}</span> — {ACTION_LABELS[a.action] || a.action}
            {a.fromValue && a.toValue ? (
              <>
                {" "}
                من <span className="font-semibold">{a.fromValue}</span> إلى{" "}
                <span className="font-semibold">{a.toValue}</span>
              </>
            ) : a.toValue ? (
              <> — <span className="font-semibold">{a.toValue}</span></>
            ) : a.fromValue ? (
              <> — <span className="font-semibold">{a.fromValue}</span></>
            ) : null}
          </p>
          <p className="text-ink-soft" dir="ltr">{fmtDate(a.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}
