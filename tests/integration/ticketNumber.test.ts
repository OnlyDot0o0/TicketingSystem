// generateTicketNumber() must produce PREFIX-000123-shaped numbers and
// increment the per-project counter atomically — including under concurrent
// callers for the SAME project, which is exactly the race a naive
// "read ticketSeq, add 1, write it back" implementation (as opposed to
// Prisma's atomic `{ increment: 1 }`) would lose ticket numbers to.
import { describe, it, expect, beforeEach } from "vitest";
import { generateTicketNumber } from "@/lib/ticketNumber";
import { resetDb, createProject, prisma } from "../helpers/db";

beforeEach(async () => {
  await resetDb();
});

describe("generateTicketNumber", () => {
  it("produces PREFIX-NNNNNN (6-digit zero-padded) starting from the project's current ticketSeq", async () => {
    const project = await createProject({ ticketPrefix: "RQ" });
    const first = await generateTicketNumber(project.id);
    expect(first).toBe("RQ-000001");
    const second = await generateTicketNumber(project.id);
    expect(second).toBe("RQ-000002");
  });

  it("continues from a project's existing non-zero ticketSeq rather than restarting", async () => {
    const project = await prisma.project.create({
      data: {
        slug: "seeded-seq",
        name: "Seeded",
        accentColorHex: "#000",
        ticketPrefix: "SEQ",
        ticketSeq: 41,
      },
    });
    expect(await generateTicketNumber(project.id)).toBe("SEQ-000042");
  });

  it("keeps two different projects' counters fully independent", async () => {
    const projectA = await createProject({ ticketPrefix: "AAA" });
    const projectB = await createProject({ ticketPrefix: "BBB" });

    expect(await generateTicketNumber(projectA.id)).toBe("AAA-000001");
    expect(await generateTicketNumber(projectA.id)).toBe("AAA-000002");
    // projectB's first number is still 000001 — unaffected by projectA's count.
    expect(await generateTicketNumber(projectB.id)).toBe("BBB-000001");
  });

  it("never collides and ends up exactly right under concurrent calls for the same project", async () => {
    const project = await createProject({ ticketPrefix: "CC" });
    const CONCURRENCY = 20;

    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => generateTicketNumber(project.id))
    );

    // Every generated number must be unique — no two concurrent callers got
    // the same sequence value.
    expect(new Set(results).size).toBe(CONCURRENCY);

    // And the SET of numbers produced must be exactly 1..20 with none
    // skipped or duplicated, i.e. the increments really were atomic.
    const numbers = results.map((r) => Number(r.split("-")[1])).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: CONCURRENCY }, (_, i) => i + 1));

    // The project's persisted counter itself must land exactly on 20, not
    // more (would mean phantom extra increments) or less (would mean lost
    // updates from the race).
    const finalProject = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(finalProject.ticketSeq).toBe(CONCURRENCY);
  });
});
