// Next sends anonymous usage telemetry unless this is set, and career-ops
// promises none. server.mjs sets it for dev and start; this covers `next build`,
// which npm runs directly and which loads this file before it records anything.
process.env.NEXT_TELEMETRY_DISABLED = "1";

// Baseline headers for an instance reachable from the internet. No CSP on
// purpose: Next's inline bootstrap scripts need a nonce pipeline, and a wrong
// policy silently breaks the app. SAMEORIGIN (not DENY) because the CV Studio
// previews the CV in a same-origin iframe.
//
// X-Robots-Tag: this is a personal instance whose landing page should not be
// indexed. Remove it when the product is launched publicly.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // Two lockfiles exist on purpose (repo root + web/), so Next would infer the
  // repo root as the workspace root. On Windows that misinference can send
  // Turbopack's postcss workers into an unbounded respawn loop that exhausts
  // all RAM (vercel/next.js#92978) — pin the root to this app.
  turbopack: { root: import.meta.dirname },
  // Allow a throwaway build dir (e.g. BUILD_DIST=.next-prod) so a production
  // `next build` can run without clobbering a live `next dev` .next.
  ...(process.env.BUILD_DIST ? { distDir: process.env.BUILD_DIST } : {}),
};

export default nextConfig;
