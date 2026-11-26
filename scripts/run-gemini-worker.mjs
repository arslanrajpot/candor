#!/usr/bin/env node
/**
 * run-gemini-worker.mjs — direct-API replacement for a headless `claude -p`
 * worker, used by a sweep script when CAREER_OPS_CLI=gemini. See
 * lib/gemini-text-worker.mjs's header for why this calls the Gemini API
 * directly instead of shelling out to the `gemini` CLI.
 *
 * The caller reads nothing to the model itself: every file the model needs to
 * "see" is passed via --context (read here and appended to the prompt as a
 * labeled block) and the model's raw text response is written verbatim to
 * --out. There is no tool access to restrict, because there is none granted.
 *
 *   node scripts/run-gemini-worker.mjs --instructions-file FILE --context FILE [--context FILE ...] --out FILE [--model NAME]
 *   node scripts/run-gemini-worker.mjs --instructions-text TEXT --context FILE --out FILE
 *
 * A step that must produce more than one file in one call (e.g.
 * daily-digest-sweep.sh's results JSON + digest markdown — one conversation
 * producing two writes in the Claude version) uses --section NAME=PATH,
 * repeatable, instead of --out. The instructions passed in must tell the
 * model to wrap each one in `===NAME===`...`===END_NAME===` markers (NAME
 * matching what --section names); this script extracts each block and writes
 * it to that section's PATH. All sections are written together, or none are:
 * a response missing even one requested section is a failure (exit 1), never
 * a partial write that leaves one file stale from an earlier run.
 *
 *   node scripts/run-gemini-worker.mjs --instructions-file FILE --context FILE --section RESULTS=a.json --section DIGEST=b.md
 *
 * Exit codes (mirrors _claude-run-guard.sh's run_claude_guarded contract, so
 * a caller branches on $? identically regardless of which CLI ran this
 * step):
 *   0   success — response text written to --out (or every --section path)
 *   75  rate limit / quota hit — caller should treat this as "try again later"
 *   2   missing/invalid API key — a setup problem, not transient
 *   1   any other failure (including a malformed multi-section response)
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { isMainModule } from '../lib/is-main-module.mjs';
import { callGeminiText, classifyGeminiError, DEFAULT_GEMINI_MODEL } from '../lib/gemini-text-worker.mjs';

const USAGE = `Usage: node scripts/run-gemini-worker.mjs --instructions-file FILE --context FILE [--context FILE ...] --out FILE [--model NAME]
   or: node scripts/run-gemini-worker.mjs --instructions-text TEXT --context FILE --out FILE

  --instructions-file FILE  File holding the system/task instructions
  --instructions-text TEXT  Instructions given inline instead of a file
  --context FILE            A file to append as context (repeatable, in order)
  --out FILE                Where to write the model's raw text response
  --section NAME=PATH       Extract a ===NAME===...===END_NAME=== block and write it to PATH
                            (repeatable; use instead of --out for a multi-file response)
  --model NAME              Gemini model (default: $GEMINI_MODEL or ${DEFAULT_GEMINI_MODEL})
  --max-output-tokens N     Default: 8192
  --help, -h                Show this message and exit

Requires GEMINI_API_KEY in the environment or the repo's .env.
Exit codes: 0 ok, 75 rate-limited (retry later), 2 bad/missing GEMINI_API_KEY, 1 other error.
`;

export function parseArgs(argv) {
  const out = { contextFiles: [], sections: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--instructions-file') out.instructionsFile = argv[++i];
    else if (a === '--instructions-text') out.instructionsText = argv[++i];
    else if (a === '--context') out.contextFiles.push(argv[++i]);
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--section') {
      const raw = argv[++i] || '';
      const eq = raw.indexOf('=');
      if (eq > 0) out.sections.push({ name: raw.slice(0, eq), path: raw.slice(eq + 1) });
    } else if (a === '--model') out.model = argv[++i];
    else if (a === '--max-output-tokens') out.maxOutputTokens = Number(argv[++i]);
  }
  return out;
}

/**
 * Extract every requested `===NAME===`...`===END_NAME===` block from the
 * model's raw response. Returns null (not a partial map) if ANY requested
 * section is missing — see this file's header for why that is all-or-nothing.
 *
 * @param {string} text
 * @param {{name: string, path: string}[]} sections
 * @returns {Map<string, string>|null}
 */
export function extractSections(text, sections) {
  const found = new Map();
  for (const { name } of sections) {
    const re = new RegExp(`===${name}===([\\s\\S]*?)===END_${name}===`);
    const m = text.match(re);
    if (!m) return null;
    found.set(name, m[1].replace(/^\n/, '').replace(/\n$/, ''));
  }
  return found;
}

/**
 * @param {{instructions: string, contextFiles: {path: string, content: string}[]}} opts
 * @returns {string}
 */
export function buildPrompt({ instructions, contextFiles }) {
  const blocks = contextFiles.map(
    ({ path, content }) => `\n\n--- BEGIN FILE: ${path} ---\n${content}\n--- END FILE: ${path} ---`,
  );
  return instructions + blocks.join('');
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    process.exit(0);
  }

  const opts = parseArgs(argv);
  const hasOutput = Boolean(opts.out) || opts.sections.length > 0;
  if ((!opts.instructionsFile && !opts.instructionsText) || !hasOutput) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  try {
    const { config } = await import('dotenv');
    config();
  } catch {
    // dotenv is optional — fall back to process.env if not installed
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    console.error('run-gemini-worker: GEMINI_API_KEY is not set (add it to .env).');
    process.exitCode = 2;
    return;
  }

  const instructions = opts.instructionsFile ? readFileSync(opts.instructionsFile, 'utf8') : opts.instructionsText;
  const contextFiles = opts.contextFiles.map((path) => ({
    path,
    content: existsSync(path) ? readFileSync(path, 'utf8') : `(file not found: ${path})`,
  }));
  const userPrompt = buildPrompt({ instructions, contextFiles });

  try {
    const { text } = await callGeminiText({
      apiKey,
      model: opts.model || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
      userPrompt,
      maxOutputTokens: opts.maxOutputTokens || 8192,
    });

    if (opts.sections.length > 0) {
      const extracted = extractSections(text, opts.sections);
      if (!extracted) {
        console.error(
          `run-gemini-worker: response is missing one or more requested sections (${opts.sections
            .map((s) => s.name)
            .join(', ')}) — writing nothing. First 500 chars of response:\n${text.slice(0, 500)}`,
        );
        process.exitCode = 1;
        return;
      }
      for (const { name, path } of opts.sections) {
        const tmp = `${path}.tmp`;
        writeFileSync(tmp, extracted.get(name));
        renameSync(tmp, path);
      }
      console.log(`run-gemini-worker: wrote ${opts.sections.length} section(s) -> ${opts.sections.map((s) => s.path).join(', ')}`);
    } else {
      const tmp = `${opts.out}.tmp`;
      writeFileSync(tmp, text);
      renameSync(tmp, opts.out);
      console.log(`run-gemini-worker: wrote ${text.length} chars -> ${opts.out}`);
    }
  } catch (err) {
    const sanitized = String((err && err.message) || err).split(apiKey).join('[REDACTED]');
    const kind = classifyGeminiError(err);
    console.error(`run-gemini-worker: ${kind} error: ${sanitized}`);
    process.exitCode = kind === 'rate_limit' ? 75 : kind === 'auth' ? 2 : 1;
  }
}

if (isMainModule(import.meta.url)) main();
