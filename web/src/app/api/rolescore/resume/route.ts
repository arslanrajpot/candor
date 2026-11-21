import { NextResponse } from "next/server";
import { getDb } from "@/lib/rolescore/db.mjs";
import { getSessionUserId } from "@/lib/rolescore/session.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const row = getDb().prepare("SELECT content, updated_at FROM resumes WHERE user_id = ?").get(userId) as
    | { content: string; updated_at: string }
    | undefined;
  return NextResponse.json({ content: row?.content || "", updatedAt: row?.updated_at || null });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content : "";
  if (!content.trim()) {
    return NextResponse.json({ error: "Resume text can't be empty." }, { status: 400 });
  }
  if (content.length > 20_000) {
    return NextResponse.json({ error: "Resume text is too long (20,000 character limit)." }, { status: 400 });
  }
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO resumes (user_id, content, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    )
    .run(userId, content, now);
  return NextResponse.json({ ok: true, updatedAt: now });
}
