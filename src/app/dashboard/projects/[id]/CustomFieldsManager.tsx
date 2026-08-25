"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createCustomFieldAction,
  updateCustomFieldAction,
  deleteCustomFieldAction,
  moveCustomFieldAction,
  CustomFieldFormState,
} from "../actions";
import { CUSTOM_FIELD_TYPE_LABELS, CUSTOM_FIELD_TYPES } from "@/lib/config";
import { parseOptions } from "@/lib/customFields";

type CustomFieldData = {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  required: boolean;
  options: string | null;
  order: number;
};

const initialState: CustomFieldFormState = {};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary text-xs">
      {pending ? "جارٍ الحفظ..." : label}
    </button>
  );
}

function AddFieldForm({ projectId }: { projectId: string }) {
  const [state, formAction] = useFormState(createCustomFieldAction, initialState);
  const [fieldType, setFieldType] = useState("TEXT");

  return (
    <form action={formAction} className="card space-y-3 bg-bg p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <h3 className="text-xs font-bold">إضافة حقل جديد</h3>
      {state?.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-700">{state.error}</div>
      )}
      {state?.success && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-2 text-xs text-green-700">{state.success}</div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="label">التسمية</label>
          <input id="label" name="label" required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="fieldType">نوع الحقل</label>
          <select
            id="fieldType"
            name="fieldType"
            className="field"
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value)}
          >
            {CUSTOM_FIELD_TYPES.map((t) => (
              <option key={t} value={t}>{CUSTOM_FIELD_TYPE_LABELS[t] || t}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="required" />
            حقل إلزامي
          </label>
        </div>
      </div>
      {fieldType === "SELECT" && (
        <div>
          <label className="label" htmlFor="options">الخيارات (خيار واحد في كل سطر)</label>
          <textarea id="options" name="options" rows={3} className="field" placeholder={"خيار أول\nخيار ثاني"} />
        </div>
      )}
      <SubmitButton label="إضافة الحقل" />
    </form>
  );
}

function FieldRow({ field, isFirst, isLast }: { field: CustomFieldData; isFirst: boolean; isLast: boolean }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [state, formAction] = useFormState(updateCustomFieldAction, initialState);
  const options = parseOptions(field.options);

  if (editing) {
    return (
      <form action={formAction} className="card space-y-2 bg-bg p-3">
        <input type="hidden" name="id" value={field.id} />
        {state?.error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-700">{state.error}</div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="label">التسمية</label>
            <input name="label" defaultValue={field.label} required className="field" />
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="required" defaultChecked={field.required} />
              حقل إلزامي
            </label>
            <span className="text-xs text-ink-soft">النوع: {CUSTOM_FIELD_TYPE_LABELS[field.fieldType] || field.fieldType} (غير قابل للتغيير)</span>
          </div>
        </div>
        {field.fieldType === "SELECT" && (
          <div>
            <label className="label">الخيارات (خيار واحد في كل سطر)</label>
            <textarea name="options" rows={3} className="field" defaultValue={options.join("\n")} />
          </div>
        )}
        <div className="flex gap-2">
          <SubmitButton label="حفظ" />
          <button type="button" className="btn btn-outline text-xs" onClick={() => setEditing(false)}>إلغاء</button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-0">
      <div className="text-sm">
        <span className="font-bold">{field.label}</span>{" "}
        <span className="text-xs text-ink-soft">
          ({CUSTOM_FIELD_TYPE_LABELS[field.fieldType] || field.fieldType}
          {field.required ? " — إلزامي" : " — اختياري"})
        </span>
        {field.fieldType === "SELECT" && options.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {options.map((o) => (
              <span key={o} className="badge text-[10px]">{o}</span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={isPending || isFirst}
          className="btn btn-outline text-xs disabled:opacity-30"
          onClick={() => startTransition(() => moveCustomFieldAction(field.id, "up"))}
          title="تحريك لأعلى"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={isPending || isLast}
          className="btn btn-outline text-xs disabled:opacity-30"
          onClick={() => startTransition(() => moveCustomFieldAction(field.id, "down"))}
          title="تحريك لأسفل"
        >
          ↓
        </button>
        <button type="button" className="btn btn-outline text-xs" onClick={() => setEditing(true)}>تعديل</button>
        <button
          type="button"
          disabled={isPending}
          className="btn btn-outline text-xs text-red-700"
          onClick={() => {
            if (confirm(`حذف الحقل "${field.label}"؟ سيتم فقدان أي قيم مُدخلة سابقًا لهذا الحقل.`)) {
              startTransition(() => deleteCustomFieldAction(field.id));
            }
          }}
        >
          حذف
        </button>
      </div>
    </div>
  );
}

export default function CustomFieldsManager({ projectId, fields }: { projectId: string; fields: CustomFieldData[] }) {
  return (
    <div className="space-y-4">
      <div>
        {fields.length === 0 && <p className="text-xs text-ink-soft">لا توجد حقول مخصصة لهذا المشروع بعد.</p>}
        {fields.map((f, i) => (
          <FieldRow key={f.id} field={f} isFirst={i === 0} isLast={i === fields.length - 1} />
        ))}
      </div>
      <AddFieldForm projectId={projectId} />
    </div>
  );
}
