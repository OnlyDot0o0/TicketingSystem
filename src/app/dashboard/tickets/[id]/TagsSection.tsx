"use client";

import { useTransition, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { addExistingTagAction, removeTagAction, createAndAddTagAction, TagFormState } from "./actions";

type Tag = { id: string; name: string; colorHex: string | null };

const initialState: TagFormState = {};

function CreateSubmit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-outline text-xs">
      {pending ? "..." : "إضافة"}
    </button>
  );
}

export default function TagsSection({
  ticketId,
  currentTags,
  projectTags,
}: {
  ticketId: string;
  currentTags: Tag[];
  projectTags: Tag[];
}) {
  const [isPending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [state, formAction] = useFormState(createAndAddTagAction, initialState);

  const currentIds = new Set(currentTags.map((t) => t.id));
  const available = projectTags.filter((t) => !currentIds.has(t.id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-ink-soft">الوسوم:</span>
        {currentTags.map((t) => (
          <span
            key={t.id}
            className="badge inline-flex items-center gap-1 text-[11px]"
            style={t.colorHex ? { borderColor: t.colorHex, color: t.colorHex } : undefined}
          >
            {t.name}
            <button
              type="button"
              disabled={isPending}
              aria-label={`إزالة الوسم ${t.name}`}
              className="mr-1 text-[10px] opacity-70 hover:opacity-100"
              onClick={() => startTransition(() => removeTagAction(ticketId, t.id))}
            >
              ✕
            </button>
          </span>
        ))}
        {currentTags.length === 0 && <span className="text-xs text-ink-soft">لا توجد وسوم</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {available.length > 0 && (
          <select
            className="field text-xs"
            defaultValue=""
            disabled={isPending}
            onChange={(e) => {
              if (e.target.value) {
                startTransition(() => addExistingTagAction(ticketId, e.target.value));
                e.target.value = "";
              }
            }}
          >
            <option value="">إضافة وسم موجود...</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        {!creating ? (
          <button type="button" className="btn btn-outline text-xs" onClick={() => setCreating(true)}>
            + وسم جديد
          </button>
        ) : (
          <form action={formAction} className="flex items-center gap-2">
            <input type="hidden" name="ticketId" value={ticketId} />
            <input name="name" placeholder="اسم الوسم" required className="field text-xs" style={{ width: 120 }} />
            <input name="colorHex" placeholder="#276661" dir="ltr" className="field text-xs" style={{ width: 90 }} />
            <CreateSubmit />
            <button type="button" className="text-xs text-ink-soft" onClick={() => setCreating(false)}>إلغاء</button>
          </form>
        )}
      </div>
      {state?.error && <p className="text-xs text-red-700">{state.error}</p>}
    </div>
  );
}
