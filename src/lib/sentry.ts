// Optional Sentry error tracking. Same graceful-degradation pattern as SMTP
// (src/lib/mail.ts) and CAPTCHA (src/lib/captcha.ts): entirely no-op until
// a DSN is set — no SDK initialization, no network calls, nothing sent
// anywhere, when unconfigured. Zero-config deployments (the default) are
// completely unaffected by this integration existing in the codebase.
//
// Two env vars, because Next.js only inlines NEXT_PUBLIC_-prefixed vars
// into the browser bundle:
//   SENTRY_DSN              read server/edge-side (route handlers, server
//                            actions, instrumentation.ts)
//   NEXT_PUBLIC_SENTRY_DSN   read client-side (React error boundaries)
// A real deployment normally sets both to the same DSN value. This module
// is imported from both server and client code; resolveDsn() below just
// picks up whichever one actually resolves in a given bundle — the other
// is always undefined there (Next.js doesn't inline unprefixed vars into
// client code) and is simply ignored, never throws.
//
// See README.md's "Error tracking hooks" section for exactly what's wired
// up (sentry.server.config.ts / sentry.edge.config.ts / sentry.client.config.ts,
// src/instrumentation.ts, src/app/global-error.tsx, src/app/dashboard/error.tsx)
// and what's verified vs. reasoned-about without a live Sentry project.

import * as Sentry from "@sentry/nextjs";

function resolveDsn(): string | undefined {
  return process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
}

export function isSentryConfigured(): boolean {
  return Boolean(resolveDsn());
}

let initialized = false;

// Idempotent — safe to call from multiple entry points (sentry.server.config.ts,
// sentry.edge.config.ts, sentry.client.config.ts, and defensively again from
// captureException below) without double-initializing.
export function initSentry() {
  if (initialized) return;
  const dsn = resolveDsn();
  if (!dsn) return; // no-op — see module comment above

  Sentry.init({
    dsn,
    // Off by default — tracing/performance monitoring is a separate opt-in
    // concern from "capture uncaught errors," and sampling transactions
    // costs quota on a real Sentry project. A deployment that wants
    // performance tracing too can raise this; not asked for here.
    tracesSampleRate: 0,
    debug: false,
  });
  initialized = true;
}

// The one function the rest of the app calls. No-ops (but still logs
// locally, so errors aren't silently swallowed in an unconfigured
// environment — same "log instead of losing it" spirit as mail.ts's
// no-SMTP console fallback) when Sentry isn't configured.
export function captureException(err: unknown, extra?: Record<string, unknown>) {
  if (!isSentryConfigured()) {
    console.error("[sentry:no-op]", err, extra || "");
    return;
  }
  initSentry(); // idempotent safety net in case this runs before the config files' init call
  Sentry.captureException(err, extra ? { extra } : undefined);
}

// Next.js's notFound()/redirect() (used throughout src/lib/access.ts, e.g.
// requireScopedViewer()) work by throwing a special internal error that
// Next's own rendering machinery inspects afterward — NOT a real error.
// Anything that wraps a route handler/server action body in a plain
// try/catch (e.g. src/app/dashboard/export.csv/route.ts below) must detect
// and rethrow these untouched rather than reporting them to Sentry as bugs
// (a viewer correctly getting 404'd by access control isn't an incident).
// Next 14.2.15 doesn't yet export the official `unstable_rethrow` helper
// for this (added in a later 14.x/15.x release) — this checks the same
// `digest` convention that helper itself is documented to check.
//
// DYNAMIC_SERVER_USAGE (thrown when a route reads something dynamic, like
// `req.nextUrl.searchParams` here, while Next is probing whether the route
// COULD be statically pre-rendered) is the same kind of internal signal,
// not a real error either — found empirically: `npm run build` was
// reporting one of these to the no-op Sentry console log for
// /dashboard/export.csv on every build, since that route is intentionally
// always-dynamic (it reads query params and the viewer's session).
export function isNextControlFlowError(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  if (typeof digest !== "string") return false;
  return digest === "NEXT_NOT_FOUND" || digest === "DYNAMIC_SERVER_USAGE" || digest.startsWith("NEXT_REDIRECT");
}
