// Routes that are reachable without signing in and that render WITHOUT the app
// shell (no sidebar, no data providers, no assistant). One list so the request
// gate (src/proxy.ts, edge runtime) and the shell (src/components/app-shell.tsx)
// can never disagree about what "public" means. Edge-safe: no node imports.

const PUBLIC_PAGES = ["/welcome", "/dashboard-login"];
const PUBLIC_API = ["/api/dashboard-session"];
// RoleScore is a separate, multi-tenant product living inside this codebase
// (its own per-user auth in lib/rolescore/session.mjs) — it must never sit
// behind career-ops's single shared dashboard password, and it renders its
// own UI rather than the career-ops sidebar shell. Prefix match: every page
// and API route under these roots is public to the career-ops gate.
const PUBLIC_PREFIXES = ["/rolescore", "/api/rolescore"];

function hasPublicPrefix(pathname) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Pages that render bare, outside the app shell. */
export function isPublicPage(pathname) {
  return PUBLIC_PAGES.includes(pathname) || hasPublicPrefix(pathname);
}

/** Pages and API routes the sign-in gate lets through. */
export function isPublicRoute(pathname) {
  return isPublicPage(pathname) || PUBLIC_API.includes(pathname) || hasPublicPrefix(pathname);
}
