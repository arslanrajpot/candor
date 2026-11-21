import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/rolescore/current-user.mjs";
import { runEvaluation } from "@/lib/rolescore/evaluate.mjs";
import { checkRateLimit } from "@/lib/rolescore/rate-limit.mjs";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Per-user, not per-IP: this guards against a bug or runaway client hammering
  // the user's OWN key (their own money) and this process's outbound fetches,
  // not abuse from strangers (they're already behind the session check above).
  const limit = checkRateLimit(`evaluate:${userId}`, 20, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached (20 evaluations/hour). Try again later." },
      { status: 429 },
    );
  }

  const body = await readJsonObject(req);
  const keyId = typeof body?.keyId === "string" ? body.keyId : "";
  const jobDescription = typeof body?.jobDescription === "string" ? body.jobDescription.trim() : "";

  if (!keyId) return NextResponse.json({ error: "Choose an API key." }, { status: 400 });
  if (!jobDescription) return NextResponse.json({ error: "Paste a job description." }, { status: 400 });
  if (jobDescription.length > 20_000) {
    return NextResponse.json({ error: "Job description is too long (20,000 character limit)." }, { status: 400 });
  }

  try {
    const result = await runEvaluation({ userId, keyId, jobDescription });
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Evaluation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
