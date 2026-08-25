// projectStaffEmails() (private helper in src/lib/notifications.ts) scopes
// "everyone who can see this project" to: any active user with a
// ProjectMembership row for it, PLUS every SUPER_ADMIN (who bypass
// membership entirely) — regardless of built-in vs CUSTOM role. This
// specifically regression-guards a bug this project's history already
// fixed once: an earlier `role: { in: [...] }` filter never matched the
// literal string "CUSTOM", so a custom-role agent silently never heard
// about tickets even in their own project.
//
// Exercised here through notifySlaWarning()'s unassigned-ticket fallback
// path (the exact caller README documents as sharing projectStaffEmails()
// with notifyTicketCreated), with src/lib/mail.ts's sendMail mocked so we
// can assert on the recipient list without needing real SMTP.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb, createProject, createUser, addMembership, prisma } from "../helpers/db";

type MailOpts = { to: string; subject: string; html: string; text?: string };
const sendMailMock = vi.fn(async (_opts: MailOpts) => ({ skipped: true }));
vi.mock("@/lib/mail", () => ({
  sendMail: (opts: MailOpts) => sendMailMock(opts),
  emailShell: (body: string) => body,
}));

const { notifySlaWarning } = await import("@/lib/notifications");

beforeEach(async () => {
  await resetDb();
  sendMailMock.mockClear();
});

describe("projectStaffEmails scoping (via notifySlaWarning's unassigned-ticket fallback)", () => {
  it("notifies SUPER_ADMIN (always) and active project members, including CUSTOM-role members", async () => {
    const project = await createProject();
    const otherProject = await createProject();

    const superAdmin = await createUser({ role: "SUPER_ADMIN", email: "super@test.local" });

    const customRole = await prisma.customRole.create({
      data: { name: "Support (test)", baseRole: "AGENT", canManageTeam: false, canManageTicketForm: false, canViewReports: false, canManageCannedResponses: false },
    });
    const customMember = await createUser({ role: "CUSTOM", customRoleId: customRole.id, email: "custom@test.local" });
    await addMembership(customMember.id, project.id);

    const regularMember = await createUser({ role: "AGENT", email: "agent@test.local" });
    await addMembership(regularMember.id, project.id);

    const inactiveMember = await createUser({ role: "AGENT", email: "inactive@test.local", active: false });
    await addMembership(inactiveMember.id, project.id);

    const nonMember = await createUser({ role: "AGENT", email: "outsider@test.local" });
    await addMembership(nonMember.id, otherProject.id); // member of a DIFFERENT project only

    await notifySlaWarning(
      {
        ticketNumber: "T-000001",
        subject: "Test subject",
        priorityLabel: "عاجل",
        slaDueAt: new Date(),
        assignedTo: null, // unassigned -> falls back to projectStaffEmails
      },
      { id: project.id, slug: project.slug, name: project.name }
    );

    const recipients = sendMailMock.mock.calls.map((call) => call[0].to).sort();

    expect(recipients).toEqual(["agent@test.local", "custom@test.local", "super@test.local"].sort());
    expect(recipients).not.toContain("inactive@test.local");
    expect(recipients).not.toContain("outsider@test.local");
  });

  it("notifies ONLY the assigned agent when the ticket has one, bypassing the project-wide fallback", async () => {
    const project = await createProject();
    const assignee = await createUser({ role: "AGENT", email: "assignee@test.local" });
    await addMembership(assignee.id, project.id);
    const otherMember = await createUser({ role: "AGENT", email: "other-member@test.local" });
    await addMembership(otherMember.id, project.id);

    await notifySlaWarning(
      {
        ticketNumber: "T-000002",
        subject: "Test subject",
        priorityLabel: "عالي",
        slaDueAt: new Date(),
        assignedTo: { email: assignee.email },
      },
      { id: project.id, slug: project.slug, name: project.name }
    );

    const recipients = sendMailMock.mock.calls.map((call) => call[0].to);
    expect(recipients).toEqual([assignee.email]);
  });
});
