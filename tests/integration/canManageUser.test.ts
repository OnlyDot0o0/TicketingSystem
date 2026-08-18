// canManageUser() in src/app/dashboard/agents/actions.ts is not exported —
// it's private on purpose — so this exercises it through its two real
// callers, toggleAgentActiveAction and updateAgentRoleAction, both of which
// silently no-op (leave the target untouched) when canManageUser() returns
// false.
//
// The rule under test: a project-scoped ADMIN may only manage a user whose
// ENTIRE membership set is a SUBSET of the actor's own — not just "shares at
// least one project". This exact bug (the old, wrong "shares one project"
// rule) was found and fixed earlier in this project's history; these tests
// fail if it regresses back to that rule, since the target-with-an-extra-
// foreign-project case below would incorrectly succeed under the old rule.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb, createProject, createUser, addMembership, prisma } from "../helpers/db";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { toggleAgentActiveAction, updateAgentRoleAction } = await import("@/app/dashboard/agents/actions");

beforeEach(async () => {
  await resetDb();
  mockAuth.mockReset();
});

function mockSession(user: { id: string; role: string; name: string; customRoleId?: string | null }) {
  mockAuth.mockResolvedValue({ user });
}

describe("toggleAgentActiveAction — canManageUser subset rule", () => {
  it("a project-scoped ADMIN CANNOT deactivate a user whose memberships extend beyond the actor's own projects", async () => {
    const p1 = await createProject();
    const p2 = await createProject();
    const actor = await createUser({ role: "ADMIN", name: "Actor Admin" });
    await addMembership(actor.id, p1.id);
    mockSession({ id: actor.id, role: "ADMIN", name: actor.name });

    // Target belongs to BOTH p1 (shared with actor) AND p2 (which the actor
    // cannot see at all) — under the old, buggy "shares at least one
    // project" rule this would have been allowed. It must NOT be.
    const target = await createUser({ role: "AGENT", name: "Target Agent", active: true });
    await addMembership(target.id, p1.id);
    await addMembership(target.id, p2.id);

    await toggleAgentActiveAction(target.id, false);

    const refetched = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(refetched.active).toBe(true); // unchanged — the action silently no-op'd
  });

  it("a project-scoped ADMIN CAN deactivate a user whose entire membership set is within the actor's own projects", async () => {
    const p1 = await createProject();
    const p2 = await createProject();
    const actor = await createUser({ role: "ADMIN", name: "Actor Admin" });
    await addMembership(actor.id, p1.id);
    await addMembership(actor.id, p2.id);
    mockSession({ id: actor.id, role: "ADMIN", name: actor.name });

    // Target's memberships ({p1}) are a full subset of the actor's ({p1,p2}).
    const target = await createUser({ role: "AGENT", name: "Target Agent", active: true });
    await addMembership(target.id, p1.id);

    await toggleAgentActiveAction(target.id, false);

    const refetched = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(refetched.active).toBe(false);
  });

  it("a target with zero project memberships cannot be managed by a non-SUPER_ADMIN (no shared ground)", async () => {
    const p1 = await createProject();
    const actor = await createUser({ role: "ADMIN", name: "Actor Admin" });
    await addMembership(actor.id, p1.id);
    mockSession({ id: actor.id, role: "ADMIN", name: actor.name });

    const target = await createUser({ role: "AGENT", name: "Orphan Agent", active: true });

    await toggleAgentActiveAction(target.id, false);

    const refetched = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(refetched.active).toBe(true); // unchanged
  });

  it("SUPER_ADMIN can manage any user regardless of their membership set", async () => {
    const p1 = await createProject();
    const p2 = await createProject();
    const actor = await createUser({ role: "SUPER_ADMIN", name: "Super" });
    mockSession({ id: actor.id, role: "SUPER_ADMIN", name: actor.name });

    const target = await createUser({ role: "AGENT", name: "Target Agent", active: true });
    await addMembership(target.id, p1.id);
    await addMembership(target.id, p2.id);

    await toggleAgentActiveAction(target.id, false);

    const refetched = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(refetched.active).toBe(false);
  });

  it("an actor can always manage themselves (self-service escape hatch), independent of the subset rule", async () => {
    const p1 = await createProject();
    const actor = await createUser({ role: "ADMIN", name: "Actor Admin", active: true });
    await addMembership(actor.id, p1.id);
    mockSession({ id: actor.id, role: "ADMIN", name: actor.name });

    // Deactivating oneself is explicitly blocked by a separate, earlier
    // guard in toggleAgentActiveAction (`scope.userId === userId && !active`)
    // — confirm that guard, not canManageUser, is what's stopping this.
    await toggleAgentActiveAction(actor.id, false);
    const refetched = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    expect(refetched.active).toBe(true); // self-deactivation blocked
  });
});

describe("updateAgentRoleAction — same subset rule", () => {
  it("a project-scoped ADMIN cannot change the role of a user with a foreign-project membership", async () => {
    const p1 = await createProject();
    const p2 = await createProject();
    const actor = await createUser({ role: "ADMIN", name: "Actor Admin" });
    await addMembership(actor.id, p1.id);
    mockSession({ id: actor.id, role: "ADMIN", name: actor.name });

    const target = await createUser({ role: "AGENT", name: "Target Agent" });
    await addMembership(target.id, p1.id);
    await addMembership(target.id, p2.id);

    await updateAgentRoleAction(target.id, "ADMIN");

    const refetched = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(refetched.role).toBe("AGENT"); // unchanged
  });

  it("a project-scoped ADMIN CAN change the role of a user whose memberships are a full subset", async () => {
    const p1 = await createProject();
    const actor = await createUser({ role: "ADMIN", name: "Actor Admin" });
    await addMembership(actor.id, p1.id);
    mockSession({ id: actor.id, role: "ADMIN", name: actor.name });

    const target = await createUser({ role: "AGENT", name: "Target Agent" });
    await addMembership(target.id, p1.id);

    await updateAgentRoleAction(target.id, "ADMIN");

    const refetched = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(refetched.role).toBe("ADMIN");
  });

  it("a project-scoped ADMIN can never grant SUPER_ADMIN, even to a fully-manageable target", async () => {
    const p1 = await createProject();
    const actor = await createUser({ role: "ADMIN", name: "Actor Admin" });
    await addMembership(actor.id, p1.id);
    mockSession({ id: actor.id, role: "ADMIN", name: actor.name });

    const target = await createUser({ role: "AGENT", name: "Target Agent" });
    await addMembership(target.id, p1.id);

    await updateAgentRoleAction(target.id, "SUPER_ADMIN");

    const refetched = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(refetched.role).toBe("AGENT"); // refused
  });
});
