// Shared test-DB helper. Re-exports the SAME `@/lib/prisma` singleton the
// app itself uses (rather than constructing a second PrismaClient) so tests
// exercise exactly the client code path production does — it just happens to
// be pointed at prisma/test.db because vitest.config.ts sets DATABASE_URL
// before any test file (and therefore before this module) is evaluated.
import { prisma } from "@/lib/prisma";

export { prisma };

// Wipes every app table, children-before-parents so FK constraints never
// complain, all inside one transaction. Call this in `beforeEach` (or at
// least `beforeAll`) in any test file that touches the database, so tests
// build their own minimal fixtures and never see another test's (or another
// file's) leftover rows.
export async function resetDb() {
  await prisma.$transaction([
    prisma.ticketFieldValue.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.ticketMessage.deleteMany(),
    prisma.ticketActivity.deleteMany(),
    prisma.ticketTag.deleteMany(),
    prisma.ticket.deleteMany(),
    prisma.customField.deleteMany(),
    prisma.category.deleteMany(),
    prisma.cannedResponse.deleteMany(),
    prisma.tag.deleteMany(),
    prisma.adminActivity.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.projectMembership.deleteMany(),
    prisma.user.deleteMany(),
    prisma.customRole.deleteMany(),
    prisma.project.deleteMany(),
  ]);
}

let projectSeq = 0;

// Minimal project fixture builder — every test that needs a Project gets one
// with a guaranteed-unique slug/ticketPrefix (so tests can run in any order,
// any number of times, without unique-constraint collisions) and every
// column defaulted the same way the schema itself defaults it, overridable
// per test.
export async function createProject(overrides: Partial<{
  slug: string;
  name: string;
  ticketPrefix: string;
  accentColorHex: string;
  slaUrgentHours: number;
  slaHighDays: number;
  slaMediumDays: number;
  slaLowDays: number;
}> = {}) {
  projectSeq += 1;
  const n = projectSeq;
  return prisma.project.create({
    data: {
      slug: overrides.slug ?? `test-project-${n}`,
      name: overrides.name ?? `Test Project ${n}`,
      accentColorHex: overrides.accentColorHex ?? "#000000",
      ticketPrefix: overrides.ticketPrefix ?? `T${n}`,
      ...(overrides.slaUrgentHours !== undefined ? { slaUrgentHours: overrides.slaUrgentHours } : {}),
      ...(overrides.slaHighDays !== undefined ? { slaHighDays: overrides.slaHighDays } : {}),
      ...(overrides.slaMediumDays !== undefined ? { slaMediumDays: overrides.slaMediumDays } : {}),
      ...(overrides.slaLowDays !== undefined ? { slaLowDays: overrides.slaLowDays } : {}),
    },
  });
}

let userSeq = 0;

export async function createUser(overrides: Partial<{
  name: string;
  email: string;
  role: string;
  customRoleId: string | null;
  active: boolean;
}> = {}) {
  userSeq += 1;
  const n = userSeq;
  return prisma.user.create({
    data: {
      name: overrides.name ?? `Test User ${n}`,
      email: overrides.email ?? `test-user-${n}@example.test`,
      passwordHash: "unused-in-tests",
      role: overrides.role ?? "AGENT",
      customRoleId: overrides.customRoleId ?? null,
      active: overrides.active ?? true,
    },
  });
}

export async function addMembership(userId: string, projectId: string) {
  return prisma.projectMembership.create({ data: { userId, projectId } });
}

let ticketSeq = 0;

export async function createTicket(
  projectId: string,
  overrides: Partial<{
    subject: string;
    description: string;
    category: string;
    priority: string;
    status: string;
    submitterName: string;
    submitterPhone: string;
    submitterEmail: string | null;
    assignedToId: string | null;
    slaDueAt: Date;
    createdAt: Date;
    ticketNumber: string;
  }> = {}
) {
  ticketSeq += 1;
  const n = ticketSeq;
  return prisma.ticket.create({
    data: {
      projectId,
      ticketNumber: overrides.ticketNumber ?? `TEST-${String(n).padStart(6, "0")}`,
      subject: overrides.subject ?? `Test ticket ${n}`,
      description: overrides.description ?? "Test description",
      category: overrides.category ?? "OTHER",
      priority: overrides.priority ?? "MEDIUM",
      status: overrides.status ?? "NEW",
      submitterName: overrides.submitterName ?? "Test Submitter",
      submitterPhone: overrides.submitterPhone ?? "0500000000",
      submitterEmail: overrides.submitterEmail ?? null,
      assignedToId: overrides.assignedToId ?? null,
      slaDueAt: overrides.slaDueAt ?? new Date(Date.now() + 86400000),
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    },
  });
}
