import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/rolescore/db.mjs";
import { decryptSecret } from "@/lib/rolescore/crypto.mjs";
import { PROVIDERS } from "@/lib/rolescore/providers.mjs";
import { SYSTEM_PROMPT, buildUserPrompt, parseEvaluationResponse } from "@/lib/rolescore/prompt.mjs";

/**
 * Runs one evaluation using the user's own stored key, with their own money,
 * against their own resume + a pasted job description. Never touches any
 * other user's data; never logs the decrypted key.
 */
export async function runEvaluation({ userId, keyId, jobDescription }) {
  const db = getDb();

  const resumeRow = db.prepare("SELECT content FROM resumes WHERE user_id = ?").get(userId);
  if (!resumeRow?.content?.trim()) {
    throw new Error("Add your resume before running an evaluation.");
  }

  const keyRow = db
    .prepare("SELECT * FROM api_keys WHERE id = ? AND user_id = ?")
    .get(keyId, userId);
  if (!keyRow) throw new Error("API key not found.");

  const provider = PROVIDERS[keyRow.provider];
  if (!provider) throw new Error(`Unknown provider: ${keyRow.provider}`);

  const apiKey = decryptSecret(keyRow.encrypted_key);
  const userPrompt = buildUserPrompt({ resume: resumeRow.content, jobDescription });

  const rawText = await provider.call(
    { apiKey, baseUrl: keyRow.base_url, model: keyRow.model },
    SYSTEM_PROMPT,
    userPrompt,
  );
  const result = parseEvaluationResponse(rawText);

  const id = randomUUID();
  db.prepare(
    `INSERT INTO evaluations (id, user_id, key_id, jd_text, provider, model, score, verdict, result_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    keyId,
    jobDescription,
    keyRow.provider,
    keyRow.model || null,
    result.score,
    result.verdict,
    JSON.stringify(result),
    new Date().toISOString(),
  );

  return { id, ...result };
}
