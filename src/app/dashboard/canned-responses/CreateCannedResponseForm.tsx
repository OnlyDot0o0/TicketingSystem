"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createCannedResponseAction, CannedFormState } from "./actions";

const initialState: CannedFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-accent">
      {pending ? "جارٍ الإنشاء..." : "إنشاء رد جاهز"}
    </button>
  );
}

export default function CreateCannedResponseForm({ projects }: { projects: { id: string; name: string }[] }) {
  const [state, formAction] = useFormState(createCannedResponseAction, initialState);

  return (
    <form action={formAction} className="card space-y-3 p-5">
      <h2 className="text-sm font-bold">إضافة رد جاهز جديد</h2>
      {state?.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{state.error}</div>
      )}
      {state?.success && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-2 text-sm text-green-700">{state.success}</div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="projectId">المشروع</label>
          <select id="projectId" name="projectId" required className="field">
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="title">العنوان</label>
          <input id="title" name="title" required className="field" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="body">النص</label>
        <textarea id="body" name="body" required rows={3} className="field" />
      </div>
      <SubmitButton />
    </form>
  );
}
