"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createAgentAction, CreateAgentState } from "./actions";
import { ROLE_LABELS } from "@/lib/config";

const initialState: CreateAgentState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-accent">
      {pending ? "جارٍ الإنشاء..." : "إنشاء حساب"}
    </button>
  );
}

export default function CreateAgentForm({
  isSuperAdmin,
  customRoles,
  assignableProjects,
}: {
  isSuperAdmin: boolean;
  customRoles: { id: string; name: string }[];
  assignableProjects: { id: string; name: string }[];
}) {
  const [state, formAction] = useFormState(createAgentAction, initialState);
  const builtInOptions = isSuperAdmin ? ["AGENT", "ADMIN", "SUPER_ADMIN"] : ["AGENT", "ADMIN"];

  return (
    <form action={formAction} className="card space-y-3 p-5">
      <h2 className="text-sm font-bold">إضافة موظف دعم جديد</h2>
      {state?.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{state.error}</div>
      )}
      {state?.success && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-2 text-sm text-green-700">{state.success}</div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="name">الاسم</label>
          <input id="name" name="name" required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="email">البريد الإلكتروني</label>
          <input id="email" name="email" type="email" dir="ltr" required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="role">الدور</label>
          <select id="role" name="role" defaultValue="AGENT" className="field">
            {builtInOptions.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
            ))}
            {customRoles.length > 0 && (
              <optgroup label="أدوار مخصصة">
                {customRoles.map((r) => (
                  <option key={r.id} value={`CUSTOM:${r.id}`}>{r.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>
      <div>
        <p className="label">
          {isSuperAdmin
            ? "تعيين إلى مشروع (مشاريع) — اختياري إن كان الدور مدير عام"
            : "تعيين إلى مشروع (مشاريع) من مشاريعك — مطلوب"}
        </p>
        <div className="flex flex-wrap gap-3">
          {assignableProjects.map((p) => (
            <label key={p.id} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="projectIds" value={p.id} />
              {p.name}
            </label>
          ))}
          {assignableProjects.length === 0 && (
            <span className="text-xs text-ink-soft">لا توجد مشاريع متاحة.</span>
          )}
        </div>
      </div>
      <SubmitButton />
    </form>
  );
}
