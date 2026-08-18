// Bulk-action authorization: src/app/dashboard/bulk-actions.ts's internal
// loadAccessibleTickets() re-fetches and re-checks every submitted ticket id
// against canAccessProject() — it never trusts that the UI only rendered
// checkboxes for tickets the viewer could actually see (the id list could be
// stale or tampered with directly). This exercises that with a real
// test-DB scope: an AGENT who is a member of only ONE of two projects,
// asked to bulk-act on a ticket id list spanning BOTH.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb, createProject, createUser, addMembership, createTicket, prisma } from "../helpers/db";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
// revalidatePath throws outside a real Next.js request context (it looks up
// a static-generation store that only exists mid-request) — irrelevant to
// the authorization logic under test, so it's stubbed out.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { bulkUpdateStatusAction, bulkAssignAction, bulkAddTagAction } = await import(
  "@/app/dashboard/bulk-actions"
);

beforeEach(async () => {
  await resetDb();
  mockAuth.mockReset();
});

async function agentScopedToOneProject() {
  const accessibleProject = await createProject();
  const inaccessibleProject = await createProject();
  const agent = await createUser({ role: "AGENT", name: "Scoped Agent" });
  await addMembership(agent.id, accessibleProject.id);
  mockAuth.mockResolvedValue({ user: { id: agent.id, name: agent.name, role: "AGENT" } });
  return { accessibleProject, inaccessibleProject, agent };
}

describe("bulkUpdateStatusAction", () => {
  it("only updates tickets in a project the viewer is a member of; the other project's ticket is left untouched", async () => {
    const { accessibleProject, inaccessibleProject } = await agentScopedToOneProject();
    const ownTicket = await createTicket(accessibleProject.id, { status: "NEW" });
    const foreignTicket = await createTicket(inaccessibleProject.id, { status: "NEW" });

    const result = await bulkUpdateStatusAction([ownTicket.id, foreignTicket.id], "OPEN");

    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(1);

    const refetchedOwn = await prisma.ticket.findUniqueOrThrow({ where: { id: ownTicket.id } });
    const refetchedForeign = await prisma.ticket.findUniqueOrThrow({ where: { id: foreignTicket.id } });
    expect(refetchedOwn.status).toBe("OPEN");
    expect(refetchedForeign.status).toBe("NEW"); // untouched

    // Activity was logged only for the ticket actually acted on.
    const foreignActivities = await prisma.ticketActivity.findMany({ where: { ticketId: foreignTicket.id } });
    expect(foreignActivities).toHaveLength(0);
    const ownActivities = await prisma.ticketActivity.findMany({ where: { ticketId: ownTicket.id } });
    expect(ownActivities).toHaveLength(1);
  });

  it("skips a completely bogus/tampered ticket id without throwing", async () => {
    const { accessibleProject } = await agentScopedToOneProject();
    const ownTicket = await createTicket(accessibleProject.id, { status: "NEW" });

    const result = await bulkUpdateStatusAction([ownTicket.id, "not-a-real-ticket-id"], "OPEN");

    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("returns an error and updates nothing when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    const result = await bulkUpdateStatusAction(["whatever"], "OPEN");
    expect(result.updated).toBe(0);
    expect(result.error).toBeTruthy();
  });
});

describe("bulkAssignAction", () => {
  it("only reassigns the ticket in an accessible project", async () => {
    const { accessibleProject, inaccessibleProject, agent } = await agentScopedToOneProject();
    const ownTicket = await createTicket(accessibleProject.id, { assignedToId: null });
    const foreignTicket = await createTicket(inaccessibleProject.id, { assignedToId: null });

    const result = await bulkAssignAction([ownTicket.id, foreignTicket.id], agent.id);

    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(1);

    const refetchedOwn = await prisma.ticket.findUniqueOrThrow({ where: { id: ownTicket.id } });
    const refetchedForeign = await prisma.ticket.findUniqueOrThrow({ where: { id: foreignTicket.id } });
    expect(refetchedOwn.assignedToId).toBe(agent.id);
    expect(refetchedForeign.assignedToId).toBeNull();
  });
});

describe("bulkAddTagAction", () => {
  it("only tags the ticket in an accessible project, and never cross-project even if the tag itself matches", async () => {
    const { accessibleProject, inaccessibleProject } = await agentScopedToOneProject();
    const tag = await prisma.tag.create({ data: { projectId: accessibleProject.id, name: "urgent-review" } });
    const ownTicket = await createTicket(accessibleProject.id);
    const foreignTicket = await createTicket(inaccessibleProject.id);

    const result = await bulkAddTagAction([ownTicket.id, foreignTicket.id], tag.id);

    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(1);

    const ownTags = await prisma.ticketTag.findMany({ where: { ticketId: ownTicket.id } });
    const foreignTags = await prisma.ticketTag.findMany({ where: { ticketId: foreignTicket.id } });
    expect(ownTags).toHaveLength(1);
    expect(foreignTags).toHaveLength(0);
  });
});
