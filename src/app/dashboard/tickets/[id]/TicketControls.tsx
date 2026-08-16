"use client";

import { useTransition } from "react";
import { updateTicketAction, assignToMeAction } from "./actions";
import { CATEGORY_LABELS, PRIORITY_LABELS, STATUS_LABELS } from "@/lib/config";

type Agent = { id: string; name: string };

export default function TicketControls({
  ticketId,
  status,
  priority,
  category,
  assignedToId,
  agents,
  currentUserId,
}: {
  ticketId: string;
  status: string;
  priority: string;
  category: string;
  assignedToId: string | null;
  agents: Agent[];
  currentUserId: string;
}) {
  const [isPending, startTransition] = useTransition();

  function submitField(name: string, value: string) {
    const fd = new FormData();
    fd.set("ticketId", ticketId);
    fd.set(name, value);
    startTransition(() => {
      updateTicketAction(fd);
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label">الحالة</label>
        <select
          className="field"
          defaultValue={status}
          disabled={isPending}
          onChange={(e) => submitField("status", e.target.value)}
        >
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">الأولوية</label>
        <select
          className="field"
          defaultValue={priority}
          disabled={isPending}
          onChange={(e) => submitField("priority", e.target.value)}
        >
          {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">التصنيف</label>
        <select
          className="field"
          defaultValue={category}
          disabled={isPending}
          onChange={(e) => submitField("category", e.target.value)}
        >
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">إسناد إلى</label>
        <div className="flex gap-2">
          <select
            className="field"
            defaultValue={assignedToId || ""}
            disabled={isPending}
            onChange={(e) => submitField("assignedToId", e.target.value)}
          >
            <option value="">غير مسندة</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {assignedToId !== currentUserId && (
            <button
              type="button"
              disabled={isPending}
              className="btn btn-outline whitespace-nowrap"
              onClick={() => startTransition(() => assignToMeAction(ticketId))}
            >
              أسندها لي
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
