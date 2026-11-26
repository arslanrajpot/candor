/**
 * gemini-text-worker.mjs — direct Gemini API text completion, with no tool or
 * filesystem access of its own.
 *
 * Why this exists instead of shelling out to the `gemini` CLI the way
 * batch-runner.sh's --cli gemini path does: web/src/lib/cli-fencing.mjs
 * (#2507) explicitly documents that `gemini`'s own sandboxing flags
 * (`--approval-mode` / a container `--sandbox`) are UNVERIFIED — "an
 * unverifiable claim must warn rather than assert enforcement," and gemini is
 * absent from that module's FENCERS table for exactly that reason. The daily
 * sweep scripts this module feeds (scripts/shortlist-sweep.sh and friends)
 * were built around a hard guarantee — Claude's --allowedTools restricted to
 * Read/Write only, deliberately never Bash — so silently swapping in an
 * agentic CLI whose own tool-restriction is unverified would remove that
 * guarantee without anyone noticing.
 *
 * A bare text completion sidesteps the question entirely: there is no tool
 * surface to fence, because there is no tool surface. The calling script
 * reads whatever context files the model needs to "see" and folds them into
 * the prompt itself (see scripts/run-gemini-worker.mjs's --context flag),
 * then writes the model's text response to disk itself — the exact
 * deterministic-read / model-judges / deterministic-write split the Claude
 * sweep scripts already use (prepare-*.mjs / agent / apply-*.mjs), just with
 * the agent's file I/O done by the wrapper instead of by the model's own
 * tools.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Mirrors gemini-eval.mjs's own default — bump both together when it changes
 * (see that file's header for the model-deprecation schedule).
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

/**
 * Classify a Gemini API error into the same three-way outcome the Claude
 * fail-fast guard (scripts/_claude-run-guard.sh) already uses, so a caller
 * can branch on one exit-code contract regardless of which CLI/provider ran:
 *   'rate_limit' -> transient, try again later (exit 75)
 *   'auth'       -> bad/missing API key, a setup problem (exit 2)
 *   'other'      -> anything else (exit 1)
 *
 * @param {unknown} err
 * @returns {'rate_limit'|'auth'|'other'}
 */
export function classifyGeminiError(err) {
  const msg = String((err && err.message) || err || '');
  if (/API_KEY|API key not valid|PERMISSION_DENIED|\b403\b/i.test(msg)) return 'auth';
  if (/quota|rate.?limit|RESOURCE_EXHAUSTED|\b429\b|exceeded your current/i.test(msg)) return 'rate_limit';
  return 'other';
}

/**
 * One-shot text completion against the Gemini API.
 *
 * @param {{
 *   apiKey: string,
 *   model?: string,
 *   systemPrompt?: string,
 *   userPrompt: string,
 *   temperature?: number,
 *   maxOutputTokens?: number,
 * }} opts
 * @returns {Promise<{text: string, usage: {promptTokens: number, completionTokens: number, totalTokens: number}}>}
 */
export async function callGeminiText({
  apiKey,
  model = DEFAULT_GEMINI_MODEL,
  systemPrompt,
  userPrompt,
  temperature = 0.4,
  maxOutputTokens = 8192,
}) {
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error('GEMINI_API_KEY is not set.');
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({
    model,
    ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
    generationConfig: { temperature, maxOutputTokens },
  });
  const result = await genModel.generateContent(userPrompt);
  const text = result.response.text();
  const u = result.response.usageMetadata || {};
  return {
    text,
    usage: {
      promptTokens: u.promptTokenCount ?? 0,
      completionTokens: u.candidatesTokenCount ?? 0,
      totalTokens: u.totalTokenCount ?? 0,
    },
  };
}
