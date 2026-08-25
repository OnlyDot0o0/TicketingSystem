"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateTicketFormConfigAction, ProjectFormState } from "../actions";
import { FIELD_MODE_LABELS, FULL_FIELD_MODES, RESTRICTED_FIELD_MODES } from "@/lib/config";

const initialState: ProjectFormState = {};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary text-sm">
      {pending ? "جارٍ الحفظ..." : "حفظ إعدادات النموذج"}
    </button>
  );
}

function ModeSelect({ name, label, defaultValue, options }: { name: string; label: string; defaultValue: string; options: readonly string[] }) {
  return (
    <div>
      <label className="label">{label}</label>
      <select name={name} defaultValue={defaultValue} className="field">
        {options.map((o) => (
          <option key={o} value={o}>{FIELD_MODE_LABELS[o] || o}</option>
        ))}
      </select>
    </div>
  );
}

export default function TicketFormConfigForm({
  projectId,
  emailMode,
  contractNumberMode,
  categoryMode,
  priorityMode,
  attachmentsMode,
}: {
  projectId: string;
  emailMode: string;
  contractNumberMode: string;
  categoryMode: string;
  priorityMode: string;
  attachmentsMode: string;
}) {
  const [state, formAction] = useFormState(updateTicketFormConfigAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      {state?.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{state.error}</div>
      )}
      {state?.success && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-2 text-sm text-green-700">{state.success}</div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <ModeSelect name="emailMode" label="البريد الإلكتروني" defaultValue={emailMode} options={FULL_FIELD_MODES} />
        <ModeSelect name="contractNumberMode" label="رقم العقد" defaultValue={contractNumberMode} options={FULL_FIELD_MODES} />
        <ModeSelect name="attachmentsMode" label="المرفقات" defaultValue={attachmentsMode} options={FULL_FIELD_MODES} />
        <ModeSelect name="categoryMode" label="التصنيف" defaultValue={categoryMode} options={RESTRICTED_FIELD_MODES} />
        <ModeSelect name="priorityMode" label="الأولوية" defaultValue={priorityMode} options={RESTRICTED_FIELD_MODES} />
      </div>
      <SaveButton />
    </form>
  );
}
