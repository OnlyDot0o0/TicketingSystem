// Auto-loaded into the browser bundle by withSentryConfig() (see
// next.config.js) — same convention @sentry/nextjs's setup wizard normally
// generates. See src/lib/sentry.ts for the actual no-op-until-configured
// logic (reads NEXT_PUBLIC_SENTRY_DSN client-side).
import { initSentry } from "@/lib/sentry";

initSentry();
