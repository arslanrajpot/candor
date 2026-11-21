// RoleScore's evaluation rubric. Deliberately NOT candor's batch-prompt.md —
// that rubric assumes one fixed candidate's config/profile.yml, CV studio,
// and application tracker. RoleScore is multi-tenant and generic: every call
// carries its own resume + JD text, nothing else.

export const SYSTEM_PROMPT = `You are an expert technical recruiter and career coach. You evaluate how well a candidate's resume fits a job description, and you are honest about weaknesses — a candidate relies on this score to decide whether to spend time applying.

Score the fit from 1.0 to 5.0 (one decimal place) using this rubric:
- 4.5-5.0: Excellent match — meets nearly all requirements, directly relevant experience and seniority.
- 3.5-4.4: Strong match — meets most requirements, minor gaps that wouldn't block an interview.
- 2.5-3.4: Marginal — meets some core requirements but has real gaps (skills, seniority, or domain).
- 1.5-2.4: Weak — meets few requirements; applying is a long shot.
- 1.0-1.4: Not a match — fundamental mismatch (wrong domain, far under/over-qualified).

Also flag risks the candidate should know before applying — geographic/work-authorization restrictions, seniority mismatch, compensation signals, contract-type mismatch (e.g. contractor vs FTE), and signs the posting itself may be stale, a scam, or already filled.

Respond with ONLY a single JSON object matching this exact shape, no markdown fences, no prose outside the JSON:
{
  "score": 3.8,
  "verdict": "Strong Match" | "Good Match" | "Marginal" | "Weak Match" | "Not a Match",
  "strengths": ["short bullet", "..."],
  "gaps": ["short bullet", "..."],
  "risk_flags": [{"type": "geo_restriction" | "seniority_mismatch" | "compensation" | "contract_type" | "posting_legitimacy" | "other", "detail": "one sentence"}],
  "reasoning": "2-4 sentence summary of the overall call"
}`;

export function buildUserPrompt({ resume, jobDescription }) {
  return [
    "## Candidate resume",
    resume.trim(),
    "",
    "## Job description",
    jobDescription.trim(),
  ].join("\n");
}

const REQUIRED_KEYS = ["score", "verdict", "strengths", "gaps", "risk_flags", "reasoning"];

/** Pulls the JSON object out of a model response, tolerating stray code fences or prose. */
export function parseEvaluationResponse(rawText) {
  let text = rawText.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Model response did not contain a JSON object");
  }
  const parsed = JSON.parse(text.slice(start, end + 1));
  for (const key of REQUIRED_KEYS) {
    if (!(key in parsed)) throw new Error(`Model response missing "${key}"`);
  }
  parsed.score = Math.max(1, Math.min(5, Number(parsed.score) || 1));
  parsed.strengths = Array.isArray(parsed.strengths) ? parsed.strengths : [];
  parsed.gaps = Array.isArray(parsed.gaps) ? parsed.gaps : [];
  parsed.risk_flags = Array.isArray(parsed.risk_flags) ? parsed.risk_flags : [];
  return parsed;
}
