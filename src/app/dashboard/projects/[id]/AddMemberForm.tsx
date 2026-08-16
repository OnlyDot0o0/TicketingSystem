"use client";

import { useFormState, useFormStatus } from "react-dom";
import { addProjectMemberAction, MembershipFormState } from "../actions";
import { ROLE_LABELS } from "@/lib/config";

const initialState: MembershipFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-accent text-sm">
      {pending ? "جارٍ الإضافة..." : "إضافة إلى الفريق"}
    </button>
  );
}

export default function AddMemberForm({
  projectId,
  candidateUsers,
}: {
  projectId: string;
  candidateUsers: { id: string; name: string; email: string; role: string }[];
}) {
  const [state, formAction] = useFormState(addProjectMemberAction, initialState);

  if (candidateUsers.length === 0) {
    return <p className="text-xs text-ink-soft">جميع المستخدمين النشطين أعضاء في هذا المشروع بالفعل.</p>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      {state?.error && (
        <div className="w-full rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{state.error}</div>
      )}
      {state?.success && (
        <div className="w-full rounded-lg border border-green-300 bg-green-50 p-2 text-sm text-green-700">{state.success}</div>
      )}
      <div className="flex-1">
        <label className="label" htmlFor="userId">إضافة عضو موجود</label>
        <select id="userId" name="userId" required className="field">
          {candidateUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} — {u.email} ({ROLE_LABELS[u.role] || u.role})
            </option>
          ))}
        </select>
      </div>
      <SubmitButton />
    </form>
  );
}
