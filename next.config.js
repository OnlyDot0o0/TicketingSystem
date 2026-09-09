// @sentry/nextjs 10.x deprecated the top-level `withSentryConfig` export in
// favor of this subpath (top-level still works but logs a deprecation
// warning on every build as of this version — confirmed by a real
// `npm run build`; will be removed entirely in v11).
const { withSentryConfig } = require("@sentry/nextjs/config");

// Security response headers, applied to every route. This app has no
// third-party script/style origins to allow (no Google Fonts, no CDN
// scripts, no next/font — confirmed by grep before writing this) EXCEPT
// Sentry's ingest endpoint once SENTRY_DSN is actually configured, and no
// external image sources (no next/image remotePatterns configured).
//
// **Known, deliberate tradeoff**: script-src and style-src both need
// 'unsafe-inline'. Next.js's App Router streams RSC hydration payloads via
// inline <script> tags it injects itself (no code in this app controls
// that), and this app renders each project's accent-color branding via
// inline `style={{ color: "var(--accent)" }}` in 18+ files (confirmed by
// grep) rather than per-project stylesheets — ripping that out for a
// nonce-based strict CSP is a real refactor of the theming system, not a
// header change, and is intentionally left as a follow-up rather than
// either silently shipping a broken app or silently shipping a CSP that
// only pretends to restrict scripts/styles. Even with 'unsafe-inline'
// present, this still blocks loading a script/stylesheet from any THIRD-
// PARTY origin (the common "inject a <script src=https://evil.example/x.js>"
// XSS payload shape), and frame-ancestors/form-action/object-src/base-uri
// below are all real, unweakened protections regardless.
// React's DEVELOPMENT build calls eval() for its own debugging tooling
// (reconstructing component stack traces) — confirmed live: without this,
// `next dev` logs "eval() is not supported... make sure unsafe-eval is
// included" in the browser console on every page load. React's own error
// text is explicit that "React will never use eval() in production mode",
// so this only ever widens script-src in development, never in the build
// that actually ships.
const isDev = process.env.NODE_ENV !== "production";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // Sentry's ingest endpoint (only ever contacted once SENTRY_DSN /
  // NEXT_PUBLIC_SENTRY_DSN is actually set — see src/lib/sentry.ts).
  // Covers both the legacy and current regional ingest hostnames since the
  // exact per-project subdomain isn't known ahead of time.
  "connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Real clickjacking protection (stronger/more reliable than the
  // X-Frame-Options header below across modern browsers) — this app is
  // never meant to be framed by another site.
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Both removed as part of the Next 16 upgrade:
  //  - `eslint.ignoreDuringBuilds` — `next build` no longer runs ESLint at
  //    all (that moved to the separate `next lint` command), so the key is
  //    dead weight; Next now warns it's unrecognized.
  //  - `experimental.instrumentationHook` — src/instrumentation.ts (the
  //    SLA-warning background scheduler's entry point) needed this flag on
  //    Next 14.2.15; instrumentation.js has been picked up by default with
  //    no flag since Next 15, and Next now warns the key is unrecognized.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          // frame-ancestors above is the real protection; this is kept as
          // defense-in-depth for the handful of older browsers that still
          // honor X-Frame-Options but not the CSP directive.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Blanket-disables browser features this app never uses. Safe to
          // always send — harmless if a viewer's browser doesn't recognize
          // a given feature name, and takes effect regardless of protocol.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          // Only enforced by browsers on a real https:// origin (ignored
          // over plain http and for localhost by spec), so safe to always
          // send in every environment including local dev.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
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
