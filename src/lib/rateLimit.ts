// Simple in-memory, fixed-window rate limiter for public ticket creation.
//
// This is fine for a single-instance deployment (the whole point of an
// in-process Map). A real production/multi-instance deploy running behind a
// load balancer would want a shared store instead (e.g. Redis with INCR +
// EXPIRE) so limits are enforced across all instances, not per-process.
//
// Buckets are keyed by an arbitrary string ("phone:0501234567",
// "ip:1.2.3.4") and hold a rolling list of timestamps within the window.

type Bucket = number[];

const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so the map doesn't grow forever in a long-running
// process — trims old entries every ~1000 checks.
let checkCount = 0;

export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key) || [];
  const withinWindow = existing.filter((t) => now - t < windowMs);

  if (withinWindow.length >= max) {
    buckets.set(key, withinWindow);
    return false;
  }

  withinWindow.push(now);
  buckets.set(key, withinWindow);

  checkCount += 1;
  if (checkCount % 1000 === 0) {
    for (const [k, v] of buckets) {
      const fresh = v.filter((t) => now - t < windowMs);
      if (fresh.length === 0) buckets.delete(k);
      else buckets.set(k, fresh);
    }
  }

  return true;
}

export const TICKET_RATE_LIMIT_PER_PHONE = 5; // per hour
export const TICKET_RATE_LIMIT_PER_IP = 10; // per hour
export const ONE_HOUR_MS = 60 * 60 * 1000;
