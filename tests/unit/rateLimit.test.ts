import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkRateLimit } from "@/lib/rateLimit";

// REDIS_URL is not set anywhere in the test env (vitest.config.ts's test.env
// only sets DATABASE_URL/NEXTAUTH_SECRET), so checkRateLimit always exercises
// the in-memory fixed-window-ish backend here — the same backend used
// whenever a real deployment doesn't opt into Redis.
let counter = 0;
function uniqueKey() {
  counter += 1;
  return `vitest-ratelimit-${counter}`;
}

describe("checkRateLimit (in-memory backend)", () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the configured max", async () => {
    const key = uniqueKey();
    expect(await checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(await checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(await checkRateLimit(key, 3, 60_000)).toBe(true);
  });

  it("denies once the max is exceeded within the window", async () => {
    const key = uniqueKey();
    await checkRateLimit(key, 2, 60_000);
    await checkRateLimit(key, 2, 60_000);
    expect(await checkRateLimit(key, 2, 60_000)).toBe(false);
    // Still denied on further attempts within the same window.
    expect(await checkRateLimit(key, 2, 60_000)).toBe(false);
  });

  it("resets and allows again once the window has fully elapsed", async () => {
    const key = uniqueKey();
    await checkRateLimit(key, 1, 1_000);
    expect(await checkRateLimit(key, 1, 1_000)).toBe(false);

    vi.advanceTimersByTime(1_001);

    expect(await checkRateLimit(key, 1, 1_000)).toBe(true);
  });

  it("keeps separate buckets per key", async () => {
    const keyA = uniqueKey();
    const keyB = uniqueKey();
    expect(await checkRateLimit(keyA, 1, 60_000)).toBe(true);
    expect(await checkRateLimit(keyA, 1, 60_000)).toBe(false);
    // A different key's bucket is unaffected by keyA's exhausted limit.
    expect(await checkRateLimit(keyB, 1, 60_000)).toBe(true);
  });

  it("a sliding window only counts requests still within the window, not a hard reset at any single instant", async () => {
    const key = uniqueKey();
    // Use up the limit right at t=0.
    await checkRateLimit(key, 2, 1_000);
    await checkRateLimit(key, 2, 1_000);
    expect(await checkRateLimit(key, 2, 1_000)).toBe(false);

    // Halfway through the window, still denied (both prior requests are
    // still within the 1000ms window).
    vi.advanceTimersByTime(500);
    expect(await checkRateLimit(key, 2, 1_000)).toBe(false);

    // Past the full window from the first request, allowed again.
    vi.advanceTimersByTime(600);
    expect(await checkRateLimit(key, 2, 1_000)).toBe(true);
  });
});
