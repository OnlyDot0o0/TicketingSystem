"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { StatusBadge, PriorityBadge, CategoryBadge, OverdueBadge } from "@/components/Badges";
import { STATUS_LABELS } from "@/lib/config";
import { isOverdue } from "@/lib/sla";
import { bulkUpdateStatusAction, bulkAssignAction, bulkAddTagAction } from "./bulk-actions";

export type QueueTicketRow = {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  slaDueAt: Date | string;
  createdAt: Date | string;
  project: { id: string; name: string; accentColorHex: string };
  assignedTo: { id: string; name: string } | null;
  tags: { tagId: string; tag: { id: string; name: string; colorHex: string | null } }[];
};

const UNASSIGN_SENTINEL = "__unassign__";

export default function TicketQueueTable({
  tickets,
  agents,
  tags,
  currentUserId,
  categoryLabelMap,
}: {
  tickets: QueueTicketRow[];
  agents: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  currentUserId: string;
  // `${projectId}:${categoryKey}` -> label — categories are per-project now
  // (v6), so each row's label is looked up via its own project id rather
  // than a single global CATEGORY_LABELS map.
  categoryLabelMap: Record<string, string>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkTag, setBulkTag] = useState("");

  const allSelected = tickets.length > 0 && tickets.every((t) => selected.has(t.id));
  const someSelected = tickets.some((t) => selected.has(t.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(tickets.map((t) => t.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runBulk(fn: () => Promise<{ updated: number; skipped: number; error?: string }>) {
    setMessage(null);
    startTransition(() => {
      fn().then((res) => {
        if (res.error) {
          setMessage(res.error);
        } else {
          setMessage(
            `تم تحديث ${res.updated} تذكرة${res.skipped > 0 ? `، تم تخطي ${res.skipped} (بلا صلاحية أو غير قابلة للتطبيق)` : ""}.`
          );
        }
        setSelected(new Set());
        setBulkStatus("");
        setBulkAssignee("");
        setBulkTag("");
      });
    });
  }

  const ids = Array.from(selected);

  return (
    <div>
      {someSelected && (
        <div className="card mb-3 flex flex-wrap items-center gap-3 p-3">
          <span className="text-sm font-bold">{selected.size} محددة</span>

          <div className="flex items-center gap-2">
            <select
              className="field"
              value={bulkStatus}
              disabled={isPending}
              onChange={(e) => setBulkStatus(e.target.value)}
            >
              <option value="">تغيير الحالة إلى...</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-outline"
              disabled={!bulkStatus || isPending}
              onClick={() => runBulk(() => bulkUpdateStatusAction(ids, bulkStatus))}
            >
              تطبيق
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select
              className="field"
              value={bulkAssignee}
              disabled={isPending}
              onChange={(e) => setBulkAssignee(e.target.value)}
            >
              <option value="">إسناد إلى...</option>
              <option value={UNASSIGN_SENTINEL}>إلغاء الإسناد</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-outline"
              disabled={!bulkAssignee || isPending}
              onClick={() =>
                runBulk(() => bulkAssignAction(ids, bulkAssignee === UNASSIGN_SENTINEL ? "" : bulkAssignee))
              }
            >
              تطبيق
            </button>
            <button
              type="button"
              className="btn btn-outline whitespace-nowrap"
              disabled={isPending}
              onClick={() => runBulk(() => bulkAssignAction(ids, currentUserId))}
            >
              إسناد لنفسي
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select
              className="field"
              value={bulkTag}
              disabled={isPending}
              onChange={(e) => setBulkTag(e.target.value)}
            >
              <option value="">إضافة وسم...</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-outline"
              disabled={!bulkTag || isPending}
              onClick={() => runBulk(() => bulkAddTagAction(ids, bulkTag))}
            >
              تطبيق
            </button>
          </div>

          {isPending && <span className="text-xs text-ink-soft">جارٍ التنفيذ...</span>}
        </div>
      )}

      {message && <p className="mb-3 text-sm font-semibold text-teal">{message}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b border-border text-right text-ink-soft">
              <th className="w-10 p-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="تحديد كل التذاكر في هذه الصفحة"
                />
              </th>
              <th className="p-3">رقم التذكرة</th>
              <th className="p-3">المشروع</th>
              <th className="p-3">الموضوع</th>
              <th className="p-3">الوسوم</th>
              <th className="p-3">التصنيف</th>
              <th className="p-3">الأولوية</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">الموظف المسؤول</th>
              <th className="p-3">موعد SLA</th>
              <th className="p-3">تاريخ الإنشاء</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => {
              const overdue = isOverdue(new Date(t.slaDueAt), t.status);
              return (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-bg">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(t.id)}
                      onChange={() => toggleOne(t.id)}
                      aria-label={`تحديد التذكرة ${t.ticketNumber}`}
                    />
                  </td>
                  <td className="p-3">
                    <Link href={`/dashboard/tickets/${t.id}`} className="font-bold text-teal" dir="ltr">
                      {t.ticketNumber}
                    </Link>
                  </td>
                  <td className="p-3">
                    <span className="badge" style={{ borderColor: t.project.accentColorHex, color: t.project.accentColorHex }}>
                      {t.project.name}
                    </span>
                  </td>
                  <td className="max-w-[220px] truncate p-3">{t.subject}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {t.tags.map((tt) => (
                        <span key={tt.tagId} className="badge text-[10px]" style={tt.tag.colorHex ? { borderColor: tt.tag.colorHex, color: tt.tag.colorHex } : undefined}>
                          {tt.tag.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3">
                    <CategoryBadge category={t.category} label={categoryLabelMap[`${t.project.id}:${t.category}`]} />
                  </td>
                  <td className="p-3"><PriorityBadge priority={t.priority} /></td>
                  <td className="p-3"><StatusBadge status={t.status} /></td>
                  <td className="p-3">{t.assignedTo?.name || "—"}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span dir="ltr">{new Date(t.slaDueAt).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })}</span>
                      {overdue && <OverdueBadge />}
                    </div>
                  </td>
                  <td className="p-3" dir="ltr">
                    {new Date(t.createdAt).toLocaleDateString("ar-SA")}
                  </td>
                </tr>
              );
            })}
            {tickets.length === 0 && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-ink-soft">
                  لا توجد تذاكر مطابقة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
