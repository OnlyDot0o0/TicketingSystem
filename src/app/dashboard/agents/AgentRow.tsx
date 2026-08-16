"use client";

import { useTransition } from "react";
import { toggleAgentActiveAction, updateAgentRoleAction } from "./actions";
import { ROLE_LABELS } from "@/lib/config";

function builtInOptionsFor(viewerIsSuperAdmin: boolean): string[] {
  return viewerIsSuperAdmin ? ["SUPER_ADMIN", "ADMIN", "AGENT"] : ["ADMIN", "AGENT"];
}

export default function AgentRow({
  id,
  name,
  email,
  role,
  customRoleId,
  customRoleName,
  active,
  isSelf,
  viewerCanAssignRoles,
  viewerIsSuperAdmin,
  customRoles,
  projectNames,
}: {
  id: string;
  name: string;
  email: string;
  role: string;
  customRoleId: string | null;
  customRoleName: string | null;
  active: boolean;
  isSelf: boolean;
  viewerCanAssignRoles: boolean;
  viewerIsSuperAdmin: boolean;
  customRoles: { id: string; name: string }[];
  projectNames: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const builtInOptions = builtInOptionsFor(viewerIsSuperAdmin);
  const currentValue = role === "CUSTOM" ? `CUSTOM:${customRoleId}` : role;
  // Can only change the role via this dropdown if the viewer is allowed to
  // manage team roles at all, this account isn't itself, and — for a
  // non-SUPER_ADMIN viewer — the account's CURRENT role isn't SUPER_ADMIN
  // (a non-super viewer can never touch a SUPER_ADMIN's row, since it
  // can't offer that role back / isn't allowed to demote it either).
  const canEditRole = !isSelf && viewerCanAssignRoles && (viewerIsSuperAdmin || role !== "SUPER_ADMIN");
  const displayLabel = role === "CUSTOM" ? customRoleName || ROLE_LABELS.CUSTOM : ROLE_LABELS[role] || role;

  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-3">{name}{isSelf && <span className="mr-1 text-xs text-ink-soft">(أنت)</span>}</td>
      <td className="p-3" dir="ltr">{email}</td>
      <td className="p-3">
        {canEditRole ? (
          <select
            className="field"
            defaultValue={currentValue}
            disabled={isPending}
            onChange={(e) => startTransition(() => updateAgentRoleAction(id, e.target.value))}
          >
            {builtInOptions.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
            ))}
            {customRoles.length > 0 && (
              <optgroup label="أدوار مخصصة">
                {customRoles.map((r) => (
                  <option key={r.id} value={`CUSTOM:${r.id}`}>{r.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        ) : (
          <span>{displayLabel}</span>
        )}
      </td>
      <td className="p-3">
        {role === "SUPER_ADMIN" ? (
          <span className="text-xs text-ink-soft">كل المشاريع</span>
        ) : projectNames.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {projectNames.map((n) => (
              <span key={n} className="badge text-[10px]">{n}</span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-ink-soft">بدون مشاريع</span>
        )}
      </td>
      <td className="p-3">
        <span className="badge" style={{ borderColor: active ? "#2e7d50" : "#c8322d", color: active ? "#2e7d50" : "#c8322d" }}>
          {active ? "نشط" : "معطّل"}
        </span>
      </td>
      <td className="p-3">
        <button
          type="button"
          disabled={isPending || (isSelf && active) || !viewerCanAssignRoles}
          className="btn btn-outline text-xs"
          onClick={() => startTransition(() => toggleAgentActiveAction(id, !active))}
        >
          {active ? "تعطيل" : "تفعيل"}
        </button>
      </td>
    </tr>
  );
}
