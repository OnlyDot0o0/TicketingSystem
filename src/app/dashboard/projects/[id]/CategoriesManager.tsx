"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  moveCategoryAction,
  CategoryFormState,
} from "../actions";

type CategoryData = {
  id: string;
  key: string;
  label: string;
  order: number;
};

const initialState: CategoryFormState = {};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary text-xs">
      {pending ? "جارٍ الحفظ..." : label}
    </button>
  );
}

function AddCategoryForm({ projectId }: { projectId: string }) {
  const [state, formAction] = useFormState(createCategoryAction, initialState);

  return (
    <form action={formAction} className="card space-y-3 bg-bg p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <h3 className="text-xs font-bold">إضافة تصنيف جديد</h3>
      {state?.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-700">{state.error}</div>
      )}
      {state?.success && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-2 text-xs text-green-700">{state.success}</div>
      )}
      <div>
        <label className="label" htmlFor="category-label">التسمية</label>
        <input id="category-label" name="label" required className="field" />
      </div>
      <SubmitButton label="إضافة التصنيف" />
    </form>
  );
}

function CategoryRow({ category, isFirst, isLast }: { category: CategoryData; isFirst: boolean; isLast: boolean }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [state, formAction] = useFormState(updateCategoryAction, initialState);

  if (editing) {
    return (
      <form action={formAction} className="card space-y-2 bg-bg p-3">
        <input type="hidden" name="id" value={category.id} />
        {state?.error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-700">{state.error}</div>
        )}
        <div>
          <label className="label">التسمية</label>
          <input name="label" defaultValue={category.label} required className="field" />
        </div>
        <p className="text-xs text-ink-soft">المفتاح: <span dir="ltr">{category.key}</span> (غير قابل للتغيير)</p>
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
        <span className="font-bold">{category.label}</span>{" "}
        <span className="text-xs text-ink-soft" dir="ltr">({category.key})</span>
        {deleteError && <p className="mt-1 text-xs text-red-700">{deleteError}</p>}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={isPending || isFirst}
          className="btn btn-outline text-xs disabled:opacity-30"
          onClick={() => startTransition(() => moveCategoryAction(category.id, "up"))}
          title="تحريك لأعلى"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={isPending || isLast}
          className="btn btn-outline text-xs disabled:opacity-30"
          onClick={() => startTransition(() => moveCategoryAction(category.id, "down"))}
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
            if (confirm(`حذف التصنيف "${category.label}"؟`)) {
              setDeleteError(null);
              startTransition(async () => {
                const result = await deleteCategoryAction(category.id);
                if (result?.error) setDeleteError(result.error);
              });
            }
          }}
        >
          حذف
        </button>
      </div>
    </div>
  );
}

export default function CategoriesManager({ projectId, categories }: { projectId: string; categories: CategoryData[] }) {
  return (
    <div className="space-y-4">
      <div>
        {categories.length === 0 && <p className="text-xs text-ink-soft">لا توجد تصنيفات لهذا المشروع بعد.</p>}
        {categories.map((c, i) => (
          <CategoryRow key={c.id} category={c} isFirst={i === 0} isLast={i === categories.length - 1} />
        ))}
      </div>
      <AddCategoryForm projectId={projectId} />
    </div>
  );
}
