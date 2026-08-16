"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { updateProjectAction, ProjectFormState } from "./actions";

const initialState: ProjectFormState = {};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary text-xs">
      {pending ? "جارٍ الحفظ..." : "حفظ"}
    </button>
  );
}

export default function ProjectRow({
  id,
  name,
  slug,
  ticketPrefix,
  accentColorHex,
  faqUrl,
  ticketCount,
}: {
  id: string;
  name: string;
  slug: string;
  ticketPrefix: string;
  accentColorHex: string;
  faqUrl: string | null;
  ticketCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useFormState(updateProjectAction, initialState);

  if (editing) {
    return (
      <tr className="border-b border-border last:border-0">
        <td colSpan={7} className="p-3">
          <form action={formAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <input type="hidden" name="id" value={id} />
            {state?.error && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700 lg:col-span-5">
                {state.error}
              </div>
            )}
            <div>
              <label className="label">اسم المشروع</label>
              <input name="name" defaultValue={name} required className="field" />
            </div>
            <div>
              <label className="label">المعرّف (slug)</label>
              <input value={slug} dir="ltr" disabled className="field opacity-60" />
            </div>
            <div>
              <label className="label">بادئة رقم التذكرة</label>
              <input name="ticketPrefix" defaultValue={ticketPrefix} dir="ltr" required className="field" />
            </div>
            <div>
              <label className="label">اللون المميز</label>
              <input name="accentColorHex" defaultValue={accentColorHex} dir="ltr" required className="field" />
            </div>
            <div>
              <label className="label">رابط الأسئلة الشائعة</label>
              <input name="faqUrl" defaultValue={faqUrl || ""} dir="ltr" className="field" />
            </div>
            <div className="flex items-end gap-2 lg:col-span-5">
              <SaveButton />
              <button type="button" className="btn btn-outline text-xs" onClick={() => setEditing(false)}>
                إلغاء
              </button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-3 font-bold">{name}</td>
      <td className="p-3" dir="ltr">
        <Link href={`/${slug}`} target="_blank" className="text-teal hover:underline">
          /{slug}
        </Link>
      </td>
      <td className="p-3" dir="ltr">{ticketPrefix}</td>
      <td className="p-3">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-4 w-4 rounded-full border border-border"
            style={{ background: accentColorHex }}
          />
          <span dir="ltr">{accentColorHex}</span>
        </span>
      </td>
      <td className="max-w-[200px] truncate p-3" dir="ltr">{faqUrl || "—"}</td>
      <td className="p-3">{ticketCount}</td>
      <td className="p-3">
        <div className="flex gap-2">
          <button type="button" className="btn btn-outline text-xs" onClick={() => setEditing(true)}>
            تعديل
          </button>
          <Link href={`/dashboard/projects/${id}`} className="btn btn-outline text-xs">
            الفريق والنموذج
          </Link>
        </div>
      </td>
    </tr>
  );
}
