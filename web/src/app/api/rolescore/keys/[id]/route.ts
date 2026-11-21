import { NextResponse } from "next/server";
import { getDb } from "@/lib/rolescore/db.mjs";
import { getSessionUserId } from "@/lib/rolescore/session.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await context.params;
  const result = getDb()
    .prepare("DELETE FROM api_keys WHERE id = ? AND user_id = ?")
    .run(id, userId);
  if (result.changes === 0) {
    return NextResponse.json({ error: "Key not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
