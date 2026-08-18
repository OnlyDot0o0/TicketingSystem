// Next.js instrumentation hook (stable since Next 14) — register() runs
// once when the server process boots. Used here to start the periodic
// SLA-breach warning check (src/lib/slaWarningScheduler.ts) as a background
// setInterval for the lifetime of this long-lived Next.js server process.
//
// register() runs for every runtime Next.js bootstraps (both the Node.js
// server and the edge runtime, if anything in the app uses it), but Prisma
// and setInterval-based background work only make sense in the Node.js
// runtime — so this is gated on NEXT_RUNTIME and the scheduler module is
// imported dynamically, exactly as Next's own docs recommend for
// instrumentation code that pulls in Node-only dependencies (a static
// top-level import would otherwise get pulled into the edge bundle too).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSlaWarningScheduler } = await import("@/lib/slaWarningScheduler");
    startSlaWarningScheduler();
  }
}
