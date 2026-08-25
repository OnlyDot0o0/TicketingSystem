"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createProjectAction, ProjectFormState } from "./actions";

const initialState: ProjectFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-accent">
      {pending ? "جارٍ الإنشاء..." : "إنشاء مشروع"}
    </button>
  );
}

export default function CreateProjectForm() {
  const [state, formAction] = useFormState(createProjectAction, initialState);

  return (
    <form action={formAction} className="card space-y-3 p-5">
      <h2 className="text-sm font-bold">إضافة مشروع جديد</h2>
      {state?.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{state.error}</div>
      )}
      {state?.success && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-2 text-sm text-green-700">{state.success}</div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="label" htmlFor="name">اسم المشروع</label>
          <input id="name" name="name" required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="slug">المعرّف (slug)</label>
          <input id="slug" name="slug" required dir="ltr" placeholder="demo" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="ticketPrefix">بادئة رقم التذكرة</label>
          <input id="ticketPrefix" name="ticketPrefix" required dir="ltr" placeholder="DEMO" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="accentColorHex">اللون المميز</label>
          <input id="accentColorHex" name="accentColorHex" required dir="ltr" placeholder="#276661" defaultValue="#276661" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="faqUrl">رابط الأسئلة الشائعة (اختياري)</label>
          <input id="faqUrl" name="faqUrl" dir="ltr" className="field" />
        </div>
      </div>
      <SubmitButton />
    </form>
  );
}
