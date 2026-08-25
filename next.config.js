const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // src/instrumentation.ts (the SLA-warning background scheduler's entry
  // point) is only picked up with this flag on the installed Next.js
  // version (14.2.15) — the instrumentation hook itself has been usable
  // since Next 14, but stays behind `experimental.instrumentationHook`
  // until Next 15, where it becomes the default with no flag needed.
  experimental: {
    instrumentationHook: true,
  },
};

// (v9) withSentryConfig() wires the client-side Sentry config
// (sentry.client.config.ts) into the browser bundle and enables optional
// source-map upload at build time — see src/lib/sentry.ts for the actual
// no-op-until-configured init logic that every runtime (server/edge/client)
// funnels through.
//
// Safe with NO Sentry env vars set at all (this app's default, zero-config
// state, confirmed by a real `npm run build`): without SENTRY_AUTH_TOKEN,
// the plugin skips source-map upload rather than failing the build (it has
// nothing to authenticate the upload with); `telemetry: false` and
// `silent: true` below additionally stop it from making its own optional
// "plugin was used" network call during the build, so a fully offline/
// unconfigured build has no Sentry-related network dependency at all.
module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  telemetry: false,
  // No wide client-side file upload without an auth token to upload with —
  // avoids the plugin even attempting network work in the unconfigured
  // (default) case.
  widenClientFileUpload: false,
});
