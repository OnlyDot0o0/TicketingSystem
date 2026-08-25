// Loaded from src/instrumentation.ts's register() for the edge runtime
// (src/middleware.ts runs here). See src/lib/sentry.ts for the actual
// no-op-until-configured logic — this file just triggers it at boot, same
// convention @sentry/nextjs's setup wizard normally generates.
import { initSentry } from "@/lib/sentry";

initSentry();
