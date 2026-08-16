"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { updateCustomRoleAction, deleteCustomRoleAction, RoleFormState } from "./actions";
import { ROLE_LABELS, PERMISSION_LABELS } from "@/lib/config";

const initialState: RoleFormState = {};
const PERMISSION_KEYS = ["canManageTeam", "canManageTicketForm", "canViewReports", "canManageCannedResponses"] as const;

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary text-xs">
      {pending ? "جارٍ الحفظ..." : "حفظ"}
    </button>
  );
}

export default function RoleRow({
  id,
  name,
  baseRole,
  canManageTeam,
  canManageTicketForm,
  canViewReports,
  canManageCannedResponses,
  userCount,
}: {
  id: string;
  name: string;
  baseRole: string;
  canManageTeam: boolean;
  canManageTicketForm: boolean;
  canViewReports: boolean;
  canManageCannedResponses: boolean;
  userCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [state, formAction] = useFormState(updateCustomRoleAction, initialState);

  const permissions: Record<string, boolean> = { canManageTeam, canManageTicketForm, canViewReports, canManageCannedResponses };

  function handleDelete() {
    setDeleteError(null);
    if (!confirm(`حذف الدور "${name}"؟`)) return;
    startTransition(async () => {
      const result = await deleteCustomRoleAction(id);
      if (result.error) setDeleteError(result.error);
    });
  }

  if (editing) {
    return (
      <tr className="border-b border-border last:border-0">
        <td colSpan={8} className="p-3">
          <form action={formAction} className="card space-y-3 bg-bg p-4">
            <input type="hidden" name="id" value={id} />
            {state?.error && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-700">{state.error}</div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">اسم الدور</label>
                <input name="name" defaultValue={name} required className="field" />
              </div>
              <div>
                <label className="label">الدور الأساسي</label>
                <select name="baseRole" defaultValue={baseRole} className="field">
                  <option value="AGENT">{ROLE_LABELS.AGENT}</option>
                  <option value="ADMIN">{ROLE_LABELS.ADMIN}</option>
                </select>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {PERMISSION_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name={key} defaultChecked={permissions[key]} />
                  {PERMISSION_LABELS[key]}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <SaveButton />
              <button type="button" className="btn btn-outline text-xs" onClick={() => setEditing(false)}>إلغاء</button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-3 font-bold">{name}</td>
      <td className="p-3">{ROLE_LABELS[baseRole] || baseRole}</td>
      <td className="p-3">{canManageTeam ? "✓" : "—"}</td>
      <td className="p-3">{canManageTicketForm ? "✓" : "—"}</td>
      <td className="p-3">{canViewReports ? "✓" : "—"}</td>
      <td className="p-3">{canManageCannedResponses ? "✓" : "—"}</td>
      <td className="p-3">{userCount}</td>
      <td className="p-3">
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-1.5">
            <button type="button" className="btn btn-outline text-xs" onClick={() => setEditing(true)}>تعديل</button>
            <button
              type="button"
              disabled={isPending}
              className="btn btn-outline text-xs text-red-700"
              onClick={handleDelete}
              title={userCount > 0 ? "لا يمكن حذف دور معيّن لمستخدمين" : "حذف"}
            >
              حذف
            </button>
          </div>
          {deleteError && <span className="max-w-[220px] text-[11px] text-red-700">{deleteError}</span>}
        </div>
      </td>
    </tr>
  );
}
