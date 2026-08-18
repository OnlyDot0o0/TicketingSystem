// Rate limiter for login/TOTP attempts and public ticket creation, with two
// backends:
//
//  - **In-memory, fixed-window-ish sliding log** (a `Map` of rolling
//    timestamps) — the original implementation, unchanged, still used
//    whenever `REDIS_URL` is unset. Correct and sufficient for a
//    single-instance deployment (the whole point of an in-process Map),
//    and remains the zero-config default — same graceful-default pattern
//    as every other optional integration in this app (SMTP, CAPTCHA,
//    object storage).
//  - **Redis, fixed-window counter (`INCR` + `EXPIRE`)** — used whenever
//    `REDIS_URL` is set, via `ioredis`. Shares limits across every
//    instance behind a load balancer, closing the multi-instance gap the
//    in-memory version was always documented as having (see "Known gaps"
//    in README.md, pre-(v9)).
//
// `checkRateLimit()`'s signature/contract is unchanged for its 3 existing
// callers (`src/app/login/actions.ts`, `src/app/[slug]/tickets/new/actions.ts`)
// beyond becoming `async` — a real Redis round-trip is inherently a network
// call, so `await` was added at each call site. All 3 call sites already
// live inside `async` server actions, so this is a mechanical one-word
// change per call site, not a logic change.
//
// Buckets are keyed by an arbitrary string ("phone:0501234567",
// "ip:1.2.3.4", "login:<email>:<ip>", "totp:<email>:<ip>").

import Redis from "ioredis";

// ---- In-memory backend (unchanged from before this round) ----------------

type Bucket = number[];

const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so the map doesn't grow forever in a long-running
// process — trims old entries every ~1000 checks.
let checkCount = 0;

function checkRateLimitInMemory(key: string, max: number, windowMs: number): boolean {
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

// ---- Redis backend ---------------------------------------------------

// Lazily created, memoized singleton — `undefined` means "not yet
// attempted", `null` means "REDIS_URL isn't set, don't bother". This keeps
// the zero-config (no `REDIS_URL`) path from ever importing/constructing an
// ioredis client at all beyond this one cheap env var check.
let redisClient: Redis | null | undefined;

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const url = process.env.REDIS_URL;
  if (!url) {
    redisClient = null;
    return redisClient;
  }

  redisClient = new Redis(url, {
    // Fail fast per-command rather than queuing/retrying indefinitely — a
    // slow or unreachable Redis should degrade this specific rate-limit
    // check quickly (see the fail-open behavior in checkRateLimit below),
    // not hang the request that's calling it.
    maxRetriesPerRequest: 1,
    // Keep retrying the underlying connection in the background (so a
    // transient outage recovers on its own without restarting the app),
    // but cap the backoff so a persistently-unreachable Redis doesn't spam
    // reconnect attempts.
    retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
  });
  // ioredis emits "error" for every failed connection/command; without a
  // listener, Node treats an unhandled "error" event on an EventEmitter as
  // a fatal, process-crashing exception. This just logs — actual failure
  // handling (fail open) happens per-call in checkRateLimit's try/catch.
  redisClient.on("error", (err: Error) => {
    console.error("[rateLimit:redis]", err.message);
  });

  return redisClient;
}

// Fixed-window counter: increments a counter keyed by the caller's bucket
// key, and sets its expiry to the window length on the FIRST increment of
// a fresh window only (an already-expiring key gets left alone) — the
// standard Redis INCR+EXPIRE fixed-window rate-limit pattern. This is
// simpler than (and behaves slightly differently from) the in-memory
// sliding-log backend above: a fixed window can allow a short burst right
// at a window boundary that a sliding log would have caught, which is an
// accepted, well-understood trade-off for the simplicity and correctness
// of INCR+EXPIRE across multiple instances.
async function checkRateLimitRedis(
  client: Redis,
  key: string,
  max: number,
  windowMs: number
): Promise<boolean> {
  const redisKey = `ratelimit:${key}`;
  const count = await client.incr(redisKey);
  if (count === 1) {
    await client.expire(redisKey, Math.max(1, Math.ceil(windowMs / 1000)));
  }
  return count <= max;
}

export async function checkRateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    return checkRateLimitInMemory(key, max, windowMs);
  }

  try {
    return await checkRateLimitRedis(client, key, max, windowMs);
  } catch (err) {
    // Fail OPEN (allow the request) rather than falling back to the
    // in-memory limiter or blocking outright. A Redis outage is an
    // availability problem with the rate limiter itself, not a signal that
    // the request is abusive — and unlike src/lib/captcha.ts (which fails
    // closed on a verification error because CAPTCHA is one specific
    // anti-bot check for one form), a rate-limit check sits in front of
    // login, TOTP, AND public ticket submission; failing closed here would
    // mean a Redis blip locks every user in the app out of everything at
    // once, which is a worse outcome than temporarily running without this
    // particular protection.
    console.error("[rateLimit:redis] check failed, failing open:", err);
    return true;
  }
}

export const TICKET_RATE_LIMIT_PER_PHONE = 5; // per hour
export const TICKET_RATE_LIMIT_PER_IP = 10; // per hour
export const ONE_HOUR_MS = 60 * 60 * 1000;
