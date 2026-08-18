// Tests the single most important authorization boundary in the app:
// SUPER_ADMIN's global bypass vs. ADMIN/AGENT/CUSTOM's hard requirement of a
// ProjectMembership row, and that every one of scopedProjectWhere()'s three
// possible return shapes (undefined / a specific id / { in: [...] }) match
// what each caller actually needs — plus that requesting an inaccessible
// project 404s instead of silently widening the query.
//
// next/navigation's notFound()/redirect() throw plain Errors carrying a
// `.digest` string (see node_modules/next/dist/client/components/not-found.js
// and redirect.js) — neither one depends on being inside a live Next.js
// request, so they're exercised for real here rather than mocked. Only the
// session resolution boundary (`auth()` from "@/lib/auth", i.e. next-auth)
// is mocked, since that's genuinely outside this module's own logic.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb, createProject, createUser, addMembership, prisma } from "../helpers/db";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

const {
  getViewerScope,
  canAccessProject,
  requireScopedViewer,
  scopedProjectWhere,
  requireProjectAccess,
  permissionsForBaseRole,
} = await import("@/lib/access");

function mockSession(user: { id: string; role: string; name: string; customRoleId?: string | null }) {
  mockAuth.mockResolvedValue({ user });
}

async function expectDigest(fn: () => Promise<unknown> | unknown, expected: RegExp) {
  try {
    await fn();
    throw new Error("expected function to throw a next/navigation control-flow error, but it did not");
  } catch (err) {
    expect((err as { digest?: string })?.digest).toMatch(expected);
  }
}

beforeEach(async () => {
  await resetDb();
  mockAuth.mockReset();
});

describe("permissionsForBaseRole", () => {
  it("built-in ADMIN has all 4 toggles true", () => {
    expect(permissionsForBaseRole("ADMIN")).toEqual({
      canManageTeam: true,
      canManageTicketForm: true,
      canViewReports: true,
      canManageCannedResponses: true,
    });
  });
  it("built-in AGENT has all 4 toggles false", () => {
    expect(permissionsForBaseRole("AGENT")).toEqual({
      canManageTeam: false,
      canManageTicketForm: false,
      canViewReports: false,
      canManageCannedResponses: false,
    });
  });
});

describe("getViewerScope", () => {
  it("returns null when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    expect(await getViewerScope()).toBeNull();
  });

  it("SUPER_ADMIN gets isSuperAdmin: true and projectIds: null (unrestricted), with zero ProjectMembership rows needed", async () => {
    const user = await createUser({ role: "SUPER_ADMIN" });
    mockSession({ id: user.id, role: "SUPER_ADMIN", name: user.name });

    const scope = await getViewerScope();

    expect(scope?.isSuperAdmin).toBe(true);
    expect(scope?.projectIds).toBeNull();
    expect(scope?.permissions).toEqual({
      canManageTeam: true,
      canManageTicketForm: true,
      canViewReports: true,
      canManageCannedResponses: true,
    });
  });

  it("ADMIN/AGENT resolve projectIds strictly from their own ProjectMembership rows", async () => {
    const projectA = await createProject();
    const projectB = await createProject();
    const user = await createUser({ role: "AGENT" });
    await addMembership(user.id, projectA.id);
    mockSession({ id: user.id, role: "AGENT", name: user.name });

    const scope = await getViewerScope();

    expect(scope?.isSuperAdmin).toBe(false);
    expect(scope?.projectIds).toEqual([projectA.id]);
    expect(scope?.projectIds).not.toContain(projectB.id);
  });

  it("a non-SUPER_ADMIN with zero memberships gets an empty projectIds array, not null", async () => {
    const user = await createUser({ role: "ADMIN" });
    mockSession({ id: user.id, role: "ADMIN", name: user.name });

    const scope = await getViewerScope();

    expect(scope?.isSuperAdmin).toBe(false);
    expect(scope?.projectIds).toEqual([]);
  });

  it("CUSTOM resolves effective permissions through the linked CustomRole row, not the built-in table", async () => {
    const customRole = await prisma.customRole.create({
      data: {
        name: "Senior Agent (test)",
        baseRole: "AGENT",
        canManageTeam: true,
        canManageTicketForm: false,
        canViewReports: true,
        canManageCannedResponses: false,
      },
    });
    const user = await createUser({ role: "CUSTOM", customRoleId: customRole.id });
    mockSession({ id: user.id, role: "CUSTOM", customRoleId: customRole.id, name: user.name });

    const scope = await getViewerScope();

    expect(scope?.baseRole).toBe("AGENT");
    expect(scope?.customRoleName).toBe("Senior Agent (test)");
    // Explicitly NOT what built-in AGENT (all-false) or ADMIN (all-true)
    // would produce — proves this came from the CustomRole row.
    expect(scope?.permissions).toEqual({
      canManageTeam: true,
      canManageTicketForm: false,
      canViewReports: true,
      canManageCannedResponses: false,
    });
  });

  it("fails closed (all permissions false) if role is CUSTOM but the linked CustomRole row no longer exists", async () => {
    // getViewerScope() resolves customRoleId from the SESSION (the JWT),
    // not by re-reading the user's own DB row — so this only needs a
    // session claiming a customRoleId that doesn't correspond to any real
    // CustomRole row (the "deleted out from under them" scenario), not an
    // actual FK-violating User row (which the schema wouldn't allow anyway,
    // and which deleteCustomRoleAction's in-use guard is meant to prevent).
    const user = await createUser({ role: "CUSTOM" });
    mockSession({ id: user.id, role: "CUSTOM", customRoleId: "deleted-role-id", name: user.name });

    const scope = await getViewerScope();

    expect(scope?.isSuperAdmin).toBe(false);
    expect(scope?.permissions).toEqual({
      canManageTeam: false,
      canManageTicketForm: false,
      canViewReports: false,
      canManageCannedResponses: false,
    });
  });
});

describe("canAccessProject", () => {
  it("SUPER_ADMIN can access any project id, without any projectIds list", () => {
    const scope = { isSuperAdmin: true, projectIds: null } as Parameters<typeof canAccessProject>[0];
    expect(canAccessProject(scope, "any-project-id")).toBe(true);
  });

  it("non-SUPER_ADMIN can access only ids present in their own projectIds", () => {
    const scope = { isSuperAdmin: false, projectIds: ["p1", "p2"] } as Parameters<typeof canAccessProject>[0];
    expect(canAccessProject(scope, "p1")).toBe(true);
    expect(canAccessProject(scope, "p3")).toBe(false);
  });

  it("a scoped user with an empty projectIds array can access nothing", () => {
    const scope = { isSuperAdmin: false, projectIds: [] as string[] } as Parameters<typeof canAccessProject>[0];
    expect(canAccessProject(scope, "anything")).toBe(false);
  });
});

describe("requireScopedViewer", () => {
  it("redirects to /login when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    await expectDigest(() => requireScopedViewer(), /^NEXT_REDIRECT;.*\/login/);
  });

  it("404s a non-SUPER_ADMIN account with zero project memberships (provisioning gap, not a broken link)", async () => {
    const user = await createUser({ role: "ADMIN" });
    mockSession({ id: user.id, role: "ADMIN", name: user.name });
    await expectDigest(() => requireScopedViewer(), /^NEXT_NOT_FOUND$/);
  });

  it("succeeds for SUPER_ADMIN even with zero memberships", async () => {
    const user = await createUser({ role: "SUPER_ADMIN" });
    mockSession({ id: user.id, role: "SUPER_ADMIN", name: user.name });
    const scope = await requireScopedViewer();
    expect(scope.isSuperAdmin).toBe(true);
  });

  it("succeeds for ADMIN/AGENT with at least one membership", async () => {
    const project = await createProject();
    const user = await createUser({ role: "AGENT" });
    await addMembership(user.id, project.id);
    mockSession({ id: user.id, role: "AGENT", name: user.name });
    const scope = await requireScopedViewer();
    expect(scope.projectIds).toEqual([project.id]);
  });
});

describe("scopedProjectWhere — three return shapes", () => {
  it("SUPER_ADMIN with no requested project filter -> undefined (no filter, sees everything)", async () => {
    const user = await createUser({ role: "SUPER_ADMIN" });
    mockSession({ id: user.id, role: "SUPER_ADMIN", name: user.name });
    const scope = await requireScopedViewer();
    expect(scopedProjectWhere(scope)).toBeUndefined();
  });

  it("SUPER_ADMIN with a requested project -> that specific project id (string)", async () => {
    const project = await createProject();
    const user = await createUser({ role: "SUPER_ADMIN" });
    mockSession({ id: user.id, role: "SUPER_ADMIN", name: user.name });
    const scope = await requireScopedViewer();
    expect(scopedProjectWhere(scope, project.id)).toBe(project.id);
  });

  it("scoped user (ADMIN/AGENT) with no requested project -> { in: projectIds }", async () => {
    const projectA = await createProject();
    const projectB = await createProject();
    const user = await createUser({ role: "AGENT" });
    await addMembership(user.id, projectA.id);
    await addMembership(user.id, projectB.id);
    mockSession({ id: user.id, role: "AGENT", name: user.name });
    const scope = await requireScopedViewer();
    expect(scopedProjectWhere(scope)).toEqual({ in: [projectA.id, projectB.id] });
  });

  it("scoped user requesting a project they DO have access to -> that project id", async () => {
    const project = await createProject();
    const user = await createUser({ role: "AGENT" });
    await addMembership(user.id, project.id);
    mockSession({ id: user.id, role: "AGENT", name: user.name });
    const scope = await requireScopedViewer();
    expect(scopedProjectWhere(scope, project.id)).toBe(project.id);
  });

  it("scoped user requesting a project they do NOT have access to -> 404s (never silently widens/ignores the filter)", async () => {
    const ownProject = await createProject();
    const otherProject = await createProject();
    const user = await createUser({ role: "AGENT" });
    await addMembership(user.id, ownProject.id);
    mockSession({ id: user.id, role: "AGENT", name: user.name });
    const scope = await requireScopedViewer();

    await expectDigest(async () => scopedProjectWhere(scope, otherProject.id), /^NEXT_NOT_FOUND$/);
  });
});

describe("requireProjectAccess", () => {
  it("404s when the viewer cannot access the given project", async () => {
    const ownProject = await createProject();
    const otherProject = await createProject();
    const user = await createUser({ role: "AGENT" });
    await addMembership(user.id, ownProject.id);
    mockSession({ id: user.id, role: "AGENT", name: user.name });

    await expectDigest(() => requireProjectAccess(otherProject.id), /^NEXT_NOT_FOUND$/);
  });

  it("succeeds and returns the scope when the viewer can access the project", async () => {
    const project = await createProject();
    const user = await createUser({ role: "AGENT" });
    await addMembership(user.id, project.id);
    mockSession({ id: user.id, role: "AGENT", name: user.name });

    const scope = await requireProjectAccess(project.id);
    expect(scope.projectIds).toContain(project.id);
  });
});
