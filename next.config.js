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

module.exports = nextConfig;
