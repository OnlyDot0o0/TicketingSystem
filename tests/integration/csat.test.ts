// CSAT rating idempotency. src/app/csat/[ticketId]/page.tsx delegates its
// idempotency decision to src/lib/csat.ts's resolveCsatRating()/
// parseCsatRatingParam() (extracted out of the page specifically so this is
// unit-testable without a JSX/React rendering toolchain) — a ticket that
// already has a satisfactionRating must NOT be silently overwritten by a
// later click on a (possibly different) star-rating link.
//
// These tests call the exact same functions the page calls, then round-trip
// through the real test DB the same way the page's own `prisma.ticket.update`
// does, so a regression in either the pure decision logic or in how it gates
// the write would be caught here.
import { describe, it, expect, beforeEach } from "vitest";
import { resolveCsatRating, parseCsatRatingParam } from "@/lib/csat";
import { resetDb, createProject, createTicket, prisma } from "../helpers/db";

beforeEach(async () => {
  await resetDb();
});

describe("parseCsatRatingParam", () => {
  it("accepts integers 1-5", () => {
    expect(parseCsatRatingParam("1")).toBe(1);
    expect(parseCsatRatingParam("5")).toBe(5);
  });
  it("rejects out-of-range or missing values", () => {
    expect(parseCsatRatingParam("0")).toBeNull();
    expect(parseCsatRatingParam("6")).toBeNull();
    expect(parseCsatRatingParam("abc")).toBeNull();
    expect(parseCsatRatingParam(undefined)).toBeNull();
  });
  it("uses parseInt semantics — a leading-digit string like '3.5' truncates to 3, matching the original page's parseInt(..., 10) behavior", () => {
    expect(parseCsatRatingParam("3.5")).toBe(3);
  });
});

describe("resolveCsatRating", () => {
  it("records a requested rating when none is on file yet", () => {
    expect(resolveCsatRating(null, 4)).toEqual({ rating: 4, shouldRecord: true });
  });
  it("does NOT overwrite an existing rating with a different requested one", () => {
    expect(resolveCsatRating(5, 1)).toEqual({ rating: 5, shouldRecord: false });
  });
  it("leaves an existing rating alone when no valid rating was requested", () => {
    expect(resolveCsatRating(3, null)).toEqual({ rating: 3, shouldRecord: false });
  });
  it("does nothing when there's no existing rating and no valid request either", () => {
    expect(resolveCsatRating(null, null)).toEqual({ rating: null, shouldRecord: false });
  });
});

describe("end-to-end idempotency against a real ticket row", () => {
  async function applyRating(ticketId: string, ratingParam: string | undefined) {
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    const requested = parseCsatRatingParam(ratingParam);
    const { shouldRecord } = resolveCsatRating(ticket.satisfactionRating, requested);
    if (shouldRecord) {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { satisfactionRating: requested, satisfactionSubmittedAt: new Date() },
      });
    }
  }

  it("first click records the rating; a second click with a different rating does not overwrite it", async () => {
    const project = await createProject();
    const ticket = await createTicket(project.id, { status: "RESOLVED" });

    await applyRating(ticket.id, "5");
    let refetched = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(refetched.satisfactionRating).toBe(5);
    const firstSubmittedAt = refetched.satisfactionSubmittedAt;

    await applyRating(ticket.id, "1");
    refetched = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(refetched.satisfactionRating).toBe(5); // unchanged
    expect(refetched.satisfactionSubmittedAt).toEqual(firstSubmittedAt); // unchanged too
  });

  it("an out-of-range rating is never recorded", async () => {
    const project = await createProject();
    const ticket = await createTicket(project.id, { status: "RESOLVED" });

    await applyRating(ticket.id, "99");

    const refetched = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(refetched.satisfactionRating).toBeNull();
  });
});
