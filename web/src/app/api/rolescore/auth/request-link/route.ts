import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/rolescore/db.mjs";
import { createLinkToken } from "@/lib/rolescore/session.mjs";
import { sendMagicLink, isEmailConfigured } from "@/lib/rolescore/mailer.mjs";
import { checkRateLimit, clientIp } from "@/lib/rolescore/rate-limit.mjs";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  // 5 link requests per 15 min per IP — enough for real use, too little to mail-bomb an inbox.
  const limit = checkRateLimit(`request-link:${ip}`, 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again later." },
      { status: 429 },
    );
  }

  const body = await readJsonObject(req);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const inviteCode = process.env.ROLESCORE_INVITE_CODE?.trim();
  if (inviteCode) {
    const providedCode = typeof body?.inviteCode === "string" ? body.inviteCode.trim() : "";
    if (providedCode !== inviteCode) {
      return NextResponse.json({ error: "Invalid invite code." }, { status: 403 });
    }
  }

  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as
    | { id: string }
    | undefined;
  if (!existing) {
    db.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)").run(
      randomUUID(),
      email,
      new Date().toISOString(),
    );
  }

  const token = createLinkToken(email);
  const origin = req.headers.get("origin") || new URL(req.url).origin;
  const link = `${origin}/api/rolescore/auth/verify?token=${encodeURIComponent(token)}`;

  const result = await sendMagicLink(email, link);

  return NextResponse.json({
    ok: true,
    emailSent: result.sent,
    // Only ever present when SMTP isn't configured — a dev convenience, never
    // served once real email is wired up (sendMagicLink omits it then).
    devLink: result.sent ? undefined : result.devLink,
    emailConfigured: isEmailConfigured(),
  });
}
