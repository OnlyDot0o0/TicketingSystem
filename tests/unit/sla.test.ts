import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  computeSlaDueAt,
  isOverdue,
  needsSlaWarning,
  DEFAULT_SLA_CONFIG,
  type SlaConfig,
} from "@/lib/sla";

// Jan 1 2024 is a known Monday — every date in this file is computed by hand
// relative to it so the expected values aren't just re-deriving the same
// weekend-skip logic under test.
const MONDAY = new Date(2024, 0, 1, 9, 0, 0); // Mon Jan 1 2024, 09:00
const THURSDAY = new Date(2024, 0, 4, 17, 0, 0); // Thu Jan 4 2024, 17:00 (last workday before the weekend)
const FRIDAY_NIGHT = new Date(2024, 0, 5, 22, 0, 0); // Fri Jan 5 2024, 22:00 (inside the weekend)

const config: SlaConfig = { slaUrgentHours: 4, slaHighDays: 1, slaMediumDays: 3, slaLowDays: 5 };

describe("computeSlaDueAt", () => {
  it("URGENT adds wall-clock hours, ignoring weekends entirely", () => {
    const due = computeSlaDueAt("URGENT", config, FRIDAY_NIGHT);
    // Fri 22:00 + 4h = Sat 02:00 — crosses straight through the Fri/Sat
    // weekend with no skipping, unlike the business-day priorities below.
    expect(due.getDay()).toBe(6); // Saturday
    expect(due.getDate()).toBe(6);
    expect(due.getHours()).toBe(2);
  });

  it("HIGH (1 business day) from a Thursday skips Friday AND Saturday, landing on Sunday", () => {
    const due = computeSlaDueAt("HIGH", config, THURSDAY);
    expect(due.getDay()).toBe(0); // Sunday
    expect(due.getDate()).toBe(7);
    expect(due.getHours()).toBe(17); // time-of-day preserved
  });

  it("MEDIUM (3 business days) from Monday skips no weekend and lands Thursday", () => {
    // Mon -> Tue(1) -> Wed(2) -> Thu(3): no Fri/Sat in the way yet.
    const due = computeSlaDueAt("MEDIUM", config, MONDAY);
    expect(due.getDay()).toBe(4); // Thursday
    expect(due.getDate()).toBe(4);
  });

  it("LOW (5 business days) from Monday skips exactly one Fri/Sat weekend and lands the following Monday", () => {
    const due = computeSlaDueAt("LOW", config, MONDAY);
    expect(due.getDay()).toBe(1); // Monday
    expect(due.getDate()).toBe(8);
  });

  it("uses the per-project SlaConfig values, not fixed global constants", () => {
    const custom: SlaConfig = { slaUrgentHours: 1, slaHighDays: 2, slaMediumDays: 2, slaLowDays: 2 };
    const due = computeSlaDueAt("URGENT", custom, MONDAY);
    expect(due.getHours()).toBe(10); // 09:00 + 1h, not the default 4h
  });

  it("DEFAULT_SLA_CONFIG matches the historically hardcoded values (4h/1d/3d/5d)", () => {
    expect(DEFAULT_SLA_CONFIG).toEqual({
      slaUrgentHours: 4,
      slaHighDays: 1,
      slaMediumDays: 3,
      slaLowDays: 5,
    });
  });
});

describe("isOverdue", () => {
  it("is true when slaDueAt is in the past and the ticket is still open", () => {
    const past = new Date(Date.now() - 1000);
    expect(isOverdue(past, "OPEN")).toBe(true);
    expect(isOverdue(past, "NEW")).toBe(true);
    expect(isOverdue(past, "PENDING")).toBe(true);
  });

  it("is false when slaDueAt is in the future", () => {
    const future = new Date(Date.now() + 1000 * 60 * 60);
    expect(isOverdue(future, "OPEN")).toBe(false);
  });

  it("is false for RESOLVED/CLOSED even when slaDueAt is in the past", () => {
    const past = new Date(Date.now() - 1000);
    expect(isOverdue(past, "RESOLVED")).toBe(false);
    expect(isOverdue(past, "CLOSED")).toBe(false);
  });
});

describe("needsSlaWarning", () => {
  const NOW = new Date(2024, 0, 10, 12, 0, 0).getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function ticket(overrides: Partial<Parameters<typeof needsSlaWarning>[0]> = {}) {
    return {
      status: "OPEN",
      createdAt: new Date(NOW - 8 * 60 * 60 * 1000), // created 8h ago
      slaDueAt: new Date(NOW + 60 * 60 * 1000), // due in 1h — total window 9h, 1h remaining
      slaWarningSentAt: null,
      ...overrides,
    };
  }

  it("warns once remaining time drops to <=25% of the ticket's own window", () => {
    // 1h remaining out of a 9h window ≈ 11% — well under the 25% threshold.
    expect(needsSlaWarning(ticket())).toBe(true);
  });

  it("does not warn while remaining time is still above 25% of the window", () => {
    // created 1h ago, due in 8h => 9h window, 8h (~89%) remaining.
    const t = ticket({ createdAt: new Date(NOW - 60 * 60 * 1000), slaDueAt: new Date(NOW + 8 * 60 * 60 * 1000) });
    expect(needsSlaWarning(t)).toBe(false);
  });

  it("treats exactly 25% remaining as due for a warning (boundary is inclusive)", () => {
    // window = 8h, remaining = 2h exactly = 25%.
    const t = ticket({ createdAt: new Date(NOW - 6 * 60 * 60 * 1000), slaDueAt: new Date(NOW + 2 * 60 * 60 * 1000) });
    expect(needsSlaWarning(t)).toBe(true);
  });

  it("never warns for RESOLVED or CLOSED tickets", () => {
    expect(needsSlaWarning(ticket({ status: "RESOLVED" }))).toBe(false);
    expect(needsSlaWarning(ticket({ status: "CLOSED" }))).toBe(false);
  });

  it("never warns twice for the same slaDueAt target", () => {
    expect(needsSlaWarning(ticket({ slaWarningSentAt: new Date(NOW - 1000) }))).toBe(false);
  });

  it("defers to isOverdue's territory once the ticket is already overdue", () => {
    const t = ticket({ slaDueAt: new Date(NOW - 1000) });
    expect(needsSlaWarning(t)).toBe(false);
  });

  it("scales the threshold to each priority's own window — a 4h URGENT ticket and a 5-business-day LOW ticket both warn at the same proportion, not the same absolute time", () => {
    // URGENT-shaped: 4h window, warn once <=1h remains.
    const urgent = ticket({
      createdAt: new Date(NOW - 3 * 60 * 60 * 1000),
      slaDueAt: new Date(NOW + 1 * 60 * 60 * 1000),
    });
    expect(needsSlaWarning(urgent)).toBe(true);

    // LOW-shaped: 100h window, 30h (30%) remaining — same absolute 30h
    // remaining would trivially clear a fixed-hours threshold, but as a
    // fraction of ITS OWN window it should NOT yet warn.
    const low = ticket({
      createdAt: new Date(NOW - 70 * 60 * 60 * 1000),
      slaDueAt: new Date(NOW + 30 * 60 * 60 * 1000),
    });
    expect(needsSlaWarning(low)).toBe(false);
  });
});
