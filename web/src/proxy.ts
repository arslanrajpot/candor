import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  checkRequest,
  parseAllowedHosts,
  parseAllowedOrigins,
} from "@/lib/origin-guard.mjs";
import { verifySessionToken, DASHBOARD_SESSION_COOKIE } from "@/lib/dashboard-session.mjs";
import { isPublicRoute } from "@/lib/public-routes.mjs";
import { safeNextPath } from "@/lib/safe-redirect.mjs";

// Optional, opt-in password gate layered on top of the origin/host guard
// below. That guard protects a *local* install from CSRF and LAN reachability;
// it was never meant to protect against the open internet, and the project's
// own docs say so plainly ("there is no login" — web/README.md, "Exposing it
// beyond this machine"). This is for exactly that case: the dashboard reachable
// over a public tunnel (e.g. Tailscale Funnel), where anyone with the URL who
// clears the origin/host guard still needs the password. Leaving both env vars
// unset leaves every existing local-only install unchanged (no gate, as today).
async function checkDashboardAuth(req: NextRequest) {
  const passwordHash = process.env.CAREER_OPS_DASHBOARD_PASSWORD_HASH;
  const sessionSecret = process.env.CAREER_OPS_DASHBOARD_SESSION_SECRET;
  if (!passwordHash || !sessionSecret) return null; // gate disabled

  const { pathname, search } = req.nextUrl;
  const isPublic = isPublicRoute(pathname);
  // Public routes never need a session — except the sign-in page, which has
  // nothing to offer someone who already has one.
  if (isPublic && pathname !== "/dashboard-login") return null;

  const token = req.cookies.get(DASHBOARD_SESSION_COOKIE)?.value;
  const valid = token ? await verifySessionToken(token, sessionSecret) : false;

  if (pathname === "/dashboard-login") {
    if (!valid) return null;
    const url = req.nextUrl.clone();
    const dest = new URL(safeNextPath(req.nextUrl.searchParams.get("next")), "http://placeholder.invalid");
    url.pathname = dest.pathname;
    url.search = dest.search;
    return NextResponse.redirect(url);
  }
  if (valid) return null;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.search = "";
  if (pathname === "/") {
    // A visitor with no session sees the public product page, not a bare
    // password box; everything deeper goes straight to sign-in and returns —
    // to the exact page, filters included (?tab=EVALUATED etc.).
    url.pathname = "/welcome";
  } else {
    url.pathname = "/dashboard-login";
    url.searchParams.set("next", pathname + search);
  }
  return NextResponse.redirect(url);
}

// Single choke point over everything the dashboard serves. Every request is
// gated on the same-origin + loopback guard before it can reach a route handler
// (which may spawn a child process or write the user's files) or a page (which
// renders the user's CV, pipeline and reports). See origin-guard.mjs for the
// two-layer rationale (F1 drive-by CSRF, F2 LAN reachability).
//
// Opt in to extra hosts (e.g. a trusted LAN box) with a comma/space separated
// CAREER_OPS_WEB_ALLOWED_HOSTS; unset means loopback only.
//
// Opt in to extra *origins* the same way with CAREER_OPS_ALLOWED_ORIGINS;
// unset means none, which is the default and leaves the guard as strict as it
// was. It is what a local companion client needs: a browser extension calls
// from a chrome-extension:// origin, which Fetch Metadata always reports as
// "cross-site", so every one of its requests is refused otherwise.
export async function proxy(req: NextRequest) {
  const decision = checkRequest({
    secFetchSite: req.headers.get("sec-fetch-site"),
    origin: req.headers.get("origin"),
    host: req.headers.get("host"),
    allowedHosts: parseAllowedHosts(process.env.CAREER_OPS_WEB_ALLOWED_HOSTS),
    allowedOrigins: parseAllowedOrigins(process.env.CAREER_OPS_ALLOWED_ORIGINS),
  });
  if (!decision.ok) {
    return NextResponse.json({ error: decision.reason }, { status: decision.status });
  }

  const authResponse = await checkDashboardAuth(req);
  if (authResponse) return authResponse;

  return NextResponse.next();
}

// Everything except build assets. Scoping this to /api left every page route
// ungated, which loopback does not cover: a page that re-resolves its own domain
// to 127.0.0.1 (DNS rebinding) fetches /pipeline same-origin from the user's own
// browser, and force-dynamic pages read the tracker off disk on each request.
// The Host header carries the attacker's domain there, so the guard refuses it —
// but only if it runs. Build assets stay out: they are the same for every user,
// carry nothing of theirs, and a caller who cannot read a page has no use for
// the chunk that renders it.
export const config = { matcher: "/((?!_next/static|_next/image|favicon.ico).*)" };
