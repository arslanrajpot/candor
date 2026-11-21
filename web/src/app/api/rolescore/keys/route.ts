import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/rolescore/db.mjs";
import { getSessionUserId } from "@/lib/rolescore/current-user.mjs";
import { encryptSecret, maskKey } from "@/lib/rolescore/crypto.mjs";
import { PROVIDERS, isKnownProvider } from "@/lib/rolescore/providers.mjs";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const rows = getDb()
    .prepare(
      "SELECT id, provider, label, base_url, model, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC",
    )
    .all(userId);
  return NextResponse.json({
    keys: rows,
    providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label })),
  });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await readJsonObject(req);
  const provider = typeof body?.provider === "string" ? body.provider : "";
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  const label = typeof body?.label === "string" ? body.label.trim().slice(0, 60) : null;
  const baseUrl = typeof body?.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl.trim() : null;
  const model = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : null;

  if (!isKnownProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: "API key can't be empty." }, { status: 400 });
  }

  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO api_keys (id, user_id, provider, label, base_url, model, encrypted_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, userId, provider, label, baseUrl, model, encryptSecret(apiKey), new Date().toISOString());

  return NextResponse.json({
    key: { id, provider, label, baseUrl, model, masked: maskKey(apiKey) },
  });
}
