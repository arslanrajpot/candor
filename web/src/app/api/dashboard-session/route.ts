import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyPassword } from "@/lib/dashboard-password.mjs";
import { createSessionToken, DASHBOARD_SESSION_COOKIE } from "@/lib/dashboard-session.mjs";
import { readJsonObject } from "@/lib/json-body";
import { clientKey, createLoginThrottle } from "@/lib/login-throttle.mjs";

export const runtime = "nodejs"; // scrypt password verification isn't edge-safe

// Login/logout for the optional dashboard password gate (see src/proxy.ts).
// Public via src/lib/public-routes.mjs, so a logged-out visitor can reach this
// route to log in at all. Reachable from the internet, hence the throttle.

const throttle = createLoginThrottle();

// A `Secure` cookie is silently dropped by the browser over plain HTTP —
// true for the real deployment (Tailscale Funnel terminates HTTPS at the
// edge, so the browser always sees https://...ts.net), but not for local
// loopback testing without a proxy in front, which stays plain http://.
// Funnel's local hop to this app is also plain HTTP, so read the scheme the
// browser actually saw from x-forwarded-proto, falling back to the request
// Next itself received for the no-proxy (direct loopback) case.
function isSecureRequest(req: NextRequest): boolean {
  return req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:";
}

export async function POST(req: NextRequest) {
  const passwordHash = process.env.CAREER_OPS_DASHBOARD_PASSWORD_HASH;
  const sessionSecret = process.env.CAREER_OPS_DASHBOARD_SESSION_SECRET;
  if (!passwordHash || !sessionSecret) {
    return NextResponse.json({ error: "Password login is not configured." }, { status: 503 });
  }

  const client = clientKey(req.headers);
  const gate = throttle.check(client);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
    );
  }

  const body = await readJsonObject<{ password?: unknown }>(req);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const password = body.password;
  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "Password required." }, { status: 400 });
  }

  if (!verifyPassword(password, passwordHash)) {
    throttle.recordFailure(client);
    // Same message on a missing vs. wrong password: either way nothing here
    // confirms whether this dashboard is even password-protected.
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }
  throttle.recordSuccess(client);

  const token = await createSessionToken(sessionSecret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DASHBOARD_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  // Same attributes as the cookie being removed: a Secure cookie is only
  // reliably replaced by a Set-Cookie that is Secure too.
  res.cookies.set(DASHBOARD_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
