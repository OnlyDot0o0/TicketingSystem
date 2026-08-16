"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createCustomRoleAction, RoleFormState } from "./actions";
import { ROLE_LABELS, PERMISSION_LABELS } from "@/lib/config";

const initialState: RoleFormState = {};
const PERMISSION_KEYS = ["canManageTeam", "canManageTicketForm", "canViewReports", "canManageCannedResponses"] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-accent">
      {pending ? "جارٍ الإنشاء..." : "إنشاء دور"}
    </button>
  );
}

export default function CreateRoleForm() {
  const [state, formAction] = useFormState(createCustomRoleAction, initialState);
  const [baseRole, setBaseRole] = useState<"ADMIN" | "AGENT">("AGENT");
  // Pre-checks each toggle to match the chosen base role's default
  // (ADMIN = all true, AGENT = all false) as a sensible starting point —
  // every toggle stays independently overridable via the checkboxes below.
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    canManageTeam: false,
    canManageTicketForm: false,
    canViewReports: false,
    canManageCannedResponses: false,
  });

  function onBaseRoleChange(next: "ADMIN" | "AGENT") {
    setBaseRole(next);
    const defaultOn = next === "ADMIN";
    setToggles({
      canManageTeam: defaultOn,
      canManageTicketForm: defaultOn,
      canViewReports: defaultOn,
      canManageCannedResponses: defaultOn,
    });
  }

  return (
    <form action={formAction} className="card space-y-3 p-5">
      <h2 className="text-sm font-bold">إنشاء دور مخصص جديد</h2>
      {state?.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{state.error}</div>
      )}
      {state?.success && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-2 text-sm text-green-700">{state.success}</div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">اسم الدور</label>
          <input id="name" name="name" required className="field" placeholder="مثال: وكيل أول" />
        </div>
        <div>
          <label className="label" htmlFor="baseRole">الدور الأساسي</label>
          <select
            id="baseRole"
            name="baseRole"
            className="field"
            value={baseRole}
            onChange={(e) => onBaseRoleChange(e.target.value as "ADMIN" | "AGENT")}
          >
            <option value="AGENT">{ROLE_LABELS.AGENT}</option>
            <option value="ADMIN">{ROLE_LABELS.ADMIN}</option>
          </select>
        </div>
      </div>
      <div>
        <p className="label">الصلاحيات الإضافية</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PERMISSION_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name={key}
                checked={toggles[key]}
                onChange={(e) => setToggles((t) => ({ ...t, [key]: e.target.checked }))}
              />
              {PERMISSION_LABELS[key]}
            </label>
          ))}
        </div>
      </div>
      <SubmitButton />
    </form>
  );
}
