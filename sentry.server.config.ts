// Loaded from src/instrumentation.ts's register() for the Node.js runtime.
// See src/lib/sentry.ts for the actual no-op-until-configured logic — this
// file just triggers it at server boot, same convention @sentry/nextjs's
// setup wizard normally generates.
import { initSentry } from "@/lib/sentry";

initSentry();
