// Next.js instrumentation hook (stable since Next 14) — register() runs
// once when the server process boots. Used here to:
//  1. Start the periodic SLA-breach warning check
//     (src/lib/slaWarningScheduler.ts) as a background setInterval for the
//     lifetime of this long-lived Next.js server process.
//  2. (v9) Initialize Sentry (src/lib/sentry.ts) for whichever runtime just
//     booted — a no-op if SENTRY_DSN isn't set. This is the standard
//     @sentry/nextjs manual-setup convention: sentry.server.config.ts /
//     sentry.edge.config.ts live at the project root and get imported from
//     here per runtime; sentry.client.config.ts (the browser one) is
//     instead auto-injected into the client bundle by withSentryConfig()
//     in next.config.js, since there's no browser equivalent of this hook
//     on the installed Next.js version (14.2.15).
//
// register() runs for every runtime Next.js bootstraps (both the Node.js
// server and the edge runtime — src/middleware.ts runs on the edge runtime
// by default), but Prisma and setInterval-based background work only make
// sense in the Node.js runtime — so the scheduler stays gated on
// NEXT_RUNTIME and is imported dynamically, exactly as Next's own docs
// recommend for instrumentation code that pulls in Node-only dependencies
// (a static top-level import would otherwise get pulled into the edge
// bundle too). Sentry, by contrast, has a real config file for each
// runtime, so both branches load their own.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSlaWarningScheduler } = await import("@/lib/slaWarningScheduler");
    startSlaWarningScheduler();
    await import("../sentry.server.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
