import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUserPrompt, parseEvaluationResponse } from "../../src/lib/rolescore/prompt.mjs";

test("buildUserPrompt includes both the resume and the JD, trimmed", () => {
  const prompt = buildUserPrompt({ resume: "  My resume  ", jobDescription: "  The JD  " });
  assert.match(prompt, /## Candidate resume\nMy resume/);
  assert.match(prompt, /## Job description\nThe JD/);
});

test("parseEvaluationResponse parses a clean JSON object", () => {
  const raw = JSON.stringify({
    score: 4.2,
    verdict: "Strong Match",
    strengths: ["a"],
    gaps: ["b"],
    risk_flags: [{ type: "other", detail: "c" }],
    reasoning: "d",
  });
  const result = parseEvaluationResponse(raw);
  assert.equal(result.score, 4.2);
  assert.equal(result.verdict, "Strong Match");
});

test("parseEvaluationResponse strips a markdown code fence", () => {
  const raw = "```json\n" + JSON.stringify({
    score: 3, verdict: "Marginal", strengths: [], gaps: [], risk_flags: [], reasoning: "x",
  }) + "\n```";
  const result = parseEvaluationResponse(raw);
  assert.equal(result.score, 3);
});

test("parseEvaluationResponse tolerates prose surrounding the JSON object", () => {
  const body = JSON.stringify({
    score: 2, verdict: "Weak Match", strengths: [], gaps: [], risk_flags: [], reasoning: "x",
  });
  const raw = `Here is the evaluation:\n${body}\nLet me know if you need more.`;
  const result = parseEvaluationResponse(raw);
  assert.equal(result.score, 2);
});

test("parseEvaluationResponse clamps score to the 1-5 range", () => {
  const raw = JSON.stringify({
    score: 9.9, verdict: "x", strengths: [], gaps: [], risk_flags: [], reasoning: "x",
  });
  assert.equal(parseEvaluationResponse(raw).score, 5);

  const raw2 = JSON.stringify({
    score: -3, verdict: "x", strengths: [], gaps: [], risk_flags: [], reasoning: "x",
  });
  assert.equal(parseEvaluationResponse(raw2).score, 1);
});

test("parseEvaluationResponse defaults a present-but-wrong-type array field to []", () => {
  // All 6 required keys must be present (checked separately below), but a key
  // present with the wrong shape (model returned a string, or null, instead of
  // an array) degrades to [] rather than throwing.
  const raw = JSON.stringify({
    score: 3, verdict: "x", strengths: null, gaps: "not an array", risk_flags: null, reasoning: "x",
  });
  const result = parseEvaluationResponse(raw);
  assert.deepEqual(result.strengths, []);
  assert.deepEqual(result.gaps, []);
  assert.deepEqual(result.risk_flags, []);
});

test("parseEvaluationResponse throws when there's no JSON object at all", () => {
  assert.throws(() => parseEvaluationResponse("no json here"));
});

test("parseEvaluationResponse throws when a required key is missing", () => {
  const raw = JSON.stringify({ score: 3, verdict: "x" }); // missing strengths/gaps/risk_flags/reasoning
  assert.throws(() => parseEvaluationResponse(raw));
});
