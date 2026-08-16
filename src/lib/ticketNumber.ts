import { prisma } from "./prisma";

// Generates a human-friendly, unique, auto-incrementing ticket number like
// "RQ-000123" using a dedicated per-project counter (Project.ticketSeq) so
// numbering stays consistent, per-project, even under concurrent ticket
// creation. The increment happens transactionally via Prisma's atomic
// `increment` operation (not a COUNT(*) race).
export async function generateTicketNumber(projectId: string): Promise<string> {
  const project = await prisma.project.update({
    where: { id: projectId },
    data: { ticketSeq: { increment: 1 } },
  });
  return `${project.ticketPrefix}-${String(project.ticketSeq).padStart(6, "0")}`;
}
