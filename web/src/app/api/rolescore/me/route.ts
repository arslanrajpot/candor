import { NextResponse } from "next/server";
import { getDb } from "@/lib/rolescore/db.mjs";
import { getSessionUserId } from "@/lib/rolescore/current-user.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const user = getDb().prepare("SELECT id, email FROM users WHERE id = ?").get(userId);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ user });
}
