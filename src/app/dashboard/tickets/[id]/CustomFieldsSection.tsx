"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { updateCustomFieldValueAction, CustomFieldValueState } from "./actions";
import { CUSTOM_FIELD_TYPE_LABELS } from "@/lib/config";
import { parseOptions } from "@/lib/customFields";

type FieldWithValue = {
  id: string;
  label: string;
  fieldType: string;
  required: boolean;
  options: string | null;
  value: string | null;
};

const initialState: CustomFieldValueState = {};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary text-xs">
      {pending ? "جارٍ الحفظ..." : "حفظ"}
    </button>
  );
}

function displayValue(field: FieldWithValue): string {
  if (!field.value) return "—";
  if (field.fieldType === "CHECKBOX") return field.value === "true" ? "نعم" : "لا";
  return field.value;
}

function FieldValueEditor({ ticketId, field, onDone }: { ticketId: string; field: FieldWithValue; onDone: () => void }) {
  const [state, formAction] = useFormState(updateCustomFieldValueAction, initialState);
  const options = parseOptions(field.options);
  const submittedRef = useRef(false);

  // Auto-close back to the read view once a submit completes without an
  // error. `submittedRef` distinguishes "just mounted with empty state"
  // from "a save actually went through" so we don't close on first render.
  useEffect(() => {
    if (submittedRef.current && !state?.error) onDone();
  }, [state]);

  return (
    <form action={formAction} onSubmit={() => { submittedRef.current = true; }} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="customFieldId" value={field.id} />
      {state?.error && <div className="w-full text-xs text-red-700">{state.error}</div>}

      {field.fieldType === "TEXTAREA" && (
        <textarea name="value" defaultValue={field.value || ""} rows={3} className="field flex-1" />
      )}
      {field.fieldType === "SELECT" && (
        <select name="value" defaultValue={field.value || ""} className="field flex-1">
          <option value="">بدون تحديد</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      )}
      {field.fieldType === "CHECKBOX" && (
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="value" value="true" defaultChecked={field.value === "true"} />
          {field.label}
        </label>
      )}
      {field.fieldType === "NUMBER" && (
        <input type="number" name="value" defaultValue={field.value || ""} className="field flex-1" dir="ltr" />
      )}
      {field.fieldType === "DATE" && (
        <input type="date" name="value" defaultValue={field.value || ""} className="field flex-1" dir="ltr" />
      )}
      {field.fieldType === "TEXT" && (
        <input type="text" name="value" defaultValue={field.value || ""} className="field flex-1" />
      )}

      <SaveButton />
      <button type="button" className="btn btn-outline text-xs" onClick={onDone}>إلغاء</button>
    </form>
  );
}

export default function CustomFieldsSection({ ticketId, fields }: { ticketId: string; fields: FieldWithValue[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (fields.length === 0) return null;

  return (
    <div className="space-y-2">
      {fields.map((f) => (
        <div key={f.id} className="border-b border-border py-1.5 last:border-0">
          {editingId === f.id ? (
            <div>
              <p className="mb-1 text-xs text-ink-soft">
                {f.label} ({CUSTOM_FIELD_TYPE_LABELS[f.fieldType] || f.fieldType}
                {f.required ? " — إلزامي" : ""})
              </p>
              <FieldValueEditor ticketId={ticketId} field={f} onDone={() => setEditingId(null)} />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex justify-between gap-2 text-sm" style={{ flex: 1 }}>
                <dt className="text-ink-soft">{f.label}</dt>
                <dd>{displayValue(f)}</dd>
              </div>
              <button type="button" className="text-xs text-teal hover:underline" onClick={() => setEditingId(f.id)}>
                تعديل
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
