// Project-scoped access control (v2), extended with custom roles (v3).
//
// SUPER_ADMIN stays fully global: sees/manages every project, ticket, user.
// ADMIN and AGENT now REQUIRE at least one ProjectMembership row to see
// anything — every dashboard view must be scoped to the project(s) they're
// a member of. Direct-URL access to a ticket/project outside that scope
// is blocked (this app returns Next's 404 page via notFound() for that,
// consistently, rather than mixing in redirects).
//
// v3: a User's `role` can also be the literal string "CUSTOM", in which
// case their actual permissions resolve through the CustomRole row pointed
// to by `customRoleId` — a named variant of ADMIN or AGENT ("baseRole")
// with 4 independently-toggleable extra permissions layered on top. Custom
// roles are ALWAYS project-scoped exactly like ADMIN/AGENT — they never
// bypass ProjectMembership; only SUPER_ADMIN itself is global. Every
// gated-action check in the app should go through `EffectivePermissions`
// below rather than comparing `role === "ADMIN"` directly.

import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type Role = "SUPER_ADMIN" | "ADMIN" | "AGENT" | "CUSTOM";
export type BaseRole = "ADMIN" | "AGENT";

export type EffectivePermissions = {
  canManageTeam: boolean;
  canManageTicketForm: boolean;
  canViewReports: boolean;
  canManageCannedResponses: boolean;
};

// Built-in ADMIN behaves as if all 4 toggles are true, built-in AGENT as if
// all 4 are false. SUPER_ADMIN bypasses everything via `isSuperAdmin`
// instead (kept separate from this object so callers can't accidentally
// forget the global bypass).
export function permissionsForBaseRole(baseRole: BaseRole): EffectivePermissions {
  const allTrue = baseRole === "ADMIN";
  return {
    canManageTeam: allTrue,
    canManageTicketForm: allTrue,
    canViewReports: allTrue,
    canManageCannedResponses: allTrue,
  };
}

const NO_PERMISSIONS: EffectivePermissions = {
  canManageTeam: false,
  canManageTicketForm: false,
  canViewReports: false,
  canManageCannedResponses: false,
};

export type ViewerScope = {
  userId: string;
  name: string;
  role: Role;
  // The role a custom role is layered on top of. For built-in ADMIN/AGENT
  // this equals `role`. For CUSTOM it's the linked CustomRole's baseRole.
  // Undefined for SUPER_ADMIN (not meaningful).
  baseRole?: BaseRole;
  customRoleId?: string | null;
  customRoleName?: string | null;
  isSuperAdmin: boolean;
  // null = unrestricted (SUPER_ADMIN). Otherwise the list of project ids
  // the viewer is a member of (may be empty).
  projectIds: string[] | null;
  // Resolved effective permissions for the 4 gated toggles. SUPER_ADMIN
  // gets all-true here too (as a convenience for UI code that doesn't want
  // to special-case isSuperAdmin separately), but access-control checks
  // should still prefer `isSuperAdmin` where the global bypass matters
  // (e.g. bypassing ProjectMembership itself).
  permissions: EffectivePermissions;
};

// Resolves the current session into a scope object. Returns null if not
// logged in (middleware already gates /dashboard/*, but callers that need
// the scope directly should still handle this).
export async function getViewerScope(): Promise<ViewerScope | null> {
  const session = await auth();
  if (!session?.user) return null;

  const role = session.user.role as Role;
  const userId = session.user.id as string;

  if (role === "SUPER_ADMIN") {
    return {
      userId,
      name: session.user.name || "",
      role,
      isSuperAdmin: true,
      projectIds: null,
      permissions: { canManageTeam: true, canManageTicketForm: true, canViewReports: true, canManageCannedResponses: true },
    };
  }

  let baseRole: BaseRole;
  let permissions: EffectivePermissions;
  let customRoleId: string | null = null;
  let customRoleName: string | null = null;

  if (role === "CUSTOM") {
    const cr = await prisma.customRole.findUnique({ where: { id: session.user.customRoleId || "" } });
    if (cr) {
      baseRole = cr.baseRole as BaseRole;
      customRoleId = cr.id;
      customRoleName = cr.name;
      permissions = {
        canManageTeam: cr.canManageTeam,
        canManageTicketForm: cr.canManageTicketForm,
        canViewReports: cr.canViewReports,
        canManageCannedResponses: cr.canManageCannedResponses,
      };
    } else {
      // Custom role was deleted out from under this user (shouldn't happen —
      // deletion is blocked while assigned — but fail closed just in case).
      baseRole = "AGENT";
      permissions = NO_PERMISSIONS;
    }
  } else {
    baseRole = role as BaseRole;
    permissions = permissionsForBaseRole(baseRole);
  }

  const memberships = await prisma.projectMembership.findMany({
    where: { userId },
    select: { projectId: true },
  });

  return {
    userId,
    name: session.user.name || "",
    role,
    baseRole,
    customRoleId,
    customRoleName,
    isSuperAdmin: false,
    projectIds: memberships.map((m) => m.projectId),
    permissions,
  };
}

// Whether the scope can see the given project at all.
export function canAccessProject(scope: ViewerScope, projectId: string): boolean {
  if (scope.isSuperAdmin) return true;
  return (scope.projectIds || []).includes(projectId);
}

// Use at the top of any dashboard page that must be scoped. Redirects to
// /login if not authenticated (defense in depth — middleware already does
// this for /dashboard/*), and 404s a non-SUPER_ADMIN with zero project
// memberships since there is nothing in-scope for them to see.
export async function requireScopedViewer(): Promise<ViewerScope> {
  const scope = await getViewerScope();
  if (!scope) redirect("/login");
  if (!scope.isSuperAdmin && (scope.projectIds || []).length === 0) {
    // No project memberships at all: nothing to show. Render the "no
    // access" state rather than a bare 404 so it's clear this is an
    // account-provisioning issue, not a broken link.
    notFound();
  }
  return scope;
}

// Restricts a Prisma `where` project filter to the viewer's scope. Pass the
// requested projectId from a query-string filter (if any); returns
// `undefined` (no filter / all accessible projects) or a specific id, and
// throws a 404 if the requested project isn't accessible.
export function scopedProjectWhere(scope: ViewerScope, requestedProjectId?: string) {
  if (requestedProjectId) {
    if (!canAccessProject(scope, requestedProjectId)) notFound();
    return requestedProjectId;
  }
  if (scope.isSuperAdmin) return undefined;
  return { in: scope.projectIds || [] };
}

export async function requireProjectAccess(projectId: string): Promise<ViewerScope> {
  const scope = await requireScopedViewer();
  if (!canAccessProject(scope, projectId)) notFound();
  return scope;
}

// Generic gate for one of the 4 permission toggles: SUPER_ADMIN always
// passes, otherwise the viewer must have the given permission AND at least
// one project membership. 404s otherwise (consistent with the rest of the
// app's "not found" treatment for out-of-scope access).
export async function requirePermission(permission: keyof EffectivePermissions): Promise<ViewerScope> {
  const scope = await requireScopedViewer();
  if (!scope.isSuperAdmin && !scope.permissions[permission]) notFound();
  return scope;
}

export function hasPermission(scope: ViewerScope, permission: keyof EffectivePermissions): boolean {
  return scope.isSuperAdmin || scope.permissions[permission];
}
