"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateSlaConfigAction, ProjectFormState } from "../actions";

const initialState: ProjectFormState = {};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary text-sm">
      {pending ? "جارٍ الحفظ..." : "حفظ إعدادات SLA"}
    </button>
  );
}

function NumberField({ name, label, defaultValue, suffix }: { name: string; label: string; defaultValue: number; suffix: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <div className="flex items-center gap-2">
        <input id={name} name={name} type="number" min={1} step={1} defaultValue={defaultValue} required className="field" dir="ltr" />
        <span className="whitespace-nowrap text-xs text-ink-soft">{suffix}</span>
      </div>
    </div>
  );
}

export default function SlaConfigForm({
  projectId,
  slaUrgentHours,
  slaHighDays,
  slaMediumDays,
  slaLowDays,
}: {
  projectId: string;
  slaUrgentHours: number;
  slaHighDays: number;
  slaMediumDays: number;
  slaLowDays: number;
}) {
  const [state, formAction] = useFormState(updateSlaConfigAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      {state?.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{state.error}</div>
      )}
      {state?.success && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-2 text-sm text-green-700">{state.success}</div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField name="slaUrgentHours" label="عاجلة" defaultValue={slaUrgentHours} suffix="ساعة" />
        <NumberField name="slaHighDays" label="عالية" defaultValue={slaHighDays} suffix="يوم عمل" />
        <NumberField name="slaMediumDays" label="متوسطة" defaultValue={slaMediumDays} suffix="يوم عمل" />
        <NumberField name="slaLowDays" label="منخفضة" defaultValue={slaLowDays} suffix="يوم عمل" />
      </div>
      <SaveButton />
    </form>
  );
}
