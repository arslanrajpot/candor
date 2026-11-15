// Routes that are reachable without signing in and that render WITHOUT the app
// shell (no sidebar, no data providers, no assistant). One list so the request
// gate (src/proxy.ts, edge runtime) and the shell (src/components/app-shell.tsx)
// can never disagree about what "public" means. Edge-safe: no node imports.

const PUBLIC_PAGES = ["/welcome", "/dashboard-login"];
const PUBLIC_API = ["/api/dashboard-session"];

/** Pages that render bare, outside the app shell. */
export function isPublicPage(pathname) {
  return PUBLIC_PAGES.includes(pathname);
}

/** Pages and API routes the sign-in gate lets through. */
export function isPublicRoute(pathname) {
  return isPublicPage(pathname) || PUBLIC_API.includes(pathname);
}
