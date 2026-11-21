import { NextResponse } from "next/server";
import { getDb } from "@/lib/rolescore/db.mjs";
import { getSessionUserId } from "@/lib/rolescore/current-user.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const rows = getDb()
    .prepare(
      "SELECT id, jd_text, provider, model, score, verdict, result_json, created_at FROM evaluations WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
    )
    .all(userId) as Array<Record<string, unknown>>;
  const evaluations = rows.map((r) => ({
    id: r.id,
    jdText: r.jd_text,
    provider: r.provider,
    model: r.model,
    score: r.score,
    verdict: r.verdict,
    result: JSON.parse(r.result_json as string),
    createdAt: r.created_at,
  }));
  return NextResponse.json({ evaluations });
}
