import { NextResponse } from "next/server";
import { getDb } from "@/lib/rolescore/db.mjs";
import { verifyLinkToken, createSessionToken, ROLESCORE_SESSION_COOKIE } from "@/lib/rolescore/session.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const email = verifyLinkToken(token);
  const origin = new URL(req.url).origin;

  if (!email) {
    const url = new URL("/rolescore", origin);
    url.searchParams.set("error", "expired-link");
    return NextResponse.redirect(url);
  }

  const user = getDb().prepare("SELECT id FROM users WHERE email = ?").get(email) as
    | { id: string }
    | undefined;
  if (!user) {
    const url = new URL("/rolescore", origin);
    url.searchParams.set("error", "expired-link");
    return NextResponse.redirect(url);
  }

  const session = createSessionToken(user.id);
  const res = NextResponse.redirect(new URL("/rolescore/dashboard", origin));
  res.cookies.set(ROLESCORE_SESSION_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}
