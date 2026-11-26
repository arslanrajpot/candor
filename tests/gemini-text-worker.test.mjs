// Tests for lib/gemini-text-worker.mjs and scripts/run-gemini-worker.mjs.
//
// classifyGeminiError and buildPrompt are pure functions and are tested
// directly. The actual network call (callGeminiText) is NOT exercised here —
// this project's own convention (see tests/ci-gemini-check.test.mjs) gates a
// real Gemini API call behind CAREER_OPS_LIVE_GEMINI=1 plus a real key, never
// in the default suite. What IS tested without a key or network access is
// run-gemini-worker.mjs's pre-network behavior: --help, missing required
// args, and a missing GEMINI_API_KEY failing closed with exit 2 and no file
// written — all reachable before any request would be sent.

import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pass, fail } from './helpers.mjs';
import { classifyGeminiError } from '../lib/gemini-text-worker.mjs';
import { buildPrompt, extractSections, parseArgs } from '../scripts/run-gemini-worker.mjs';

function section(label) { console.log(`\n-- ${label} --`); }

section('gemini-text-worker: classifyGeminiError');

function check(label, cond) {
  if (cond) pass(label);
  else fail(label);
}

check('rate limit: "Resource has been exhausted" style message', classifyGeminiError(new Error('[429] You exceeded your current quota, please check your plan')) === 'rate_limit');
check('rate limit: RESOURCE_EXHAUSTED', classifyGeminiError(new Error('RESOURCE_EXHAUSTED: rate limit')) === 'rate_limit');
check('auth: bad API key', classifyGeminiError(new Error('API key not valid. Please pass a valid API key.')) === 'auth');
check('auth: PERMISSION_DENIED', classifyGeminiError(new Error('[403] PERMISSION_DENIED')) === 'auth');
check('other: unrelated error', classifyGeminiError(new Error('ECONNRESET: socket hang up')) === 'other');
check('other: handles a bare string instead of an Error', classifyGeminiError('some random failure') === 'other');
check('other: handles undefined without throwing', classifyGeminiError(undefined) === 'other');

section('run-gemini-worker: buildPrompt');

{
  const out = buildPrompt({
    instructions: 'Do the thing.',
    contextFiles: [
      { path: 'a.yml', content: 'key: value' },
      { path: 'b.md', content: '- one\n- two' },
    ],
  });
  check('instructions appear first', out.startsWith('Do the thing.'));
  check('first file is labeled and included', out.includes('--- BEGIN FILE: a.yml ---') && out.includes('key: value'));
  check('second file is labeled and included', out.includes('--- BEGIN FILE: b.md ---') && out.includes('- one\n- two'));
  check('files appear in call order', out.indexOf('a.yml') < out.indexOf('b.md'));
}

{
  const out = buildPrompt({ instructions: 'Solo instructions.', contextFiles: [] });
  check('no context files -> instructions returned unchanged', out === 'Solo instructions.');
}

section('run-gemini-worker: parseArgs');

{
  const args = parseArgs(['--instructions-file', 'i.txt', '--context', 'a.yml', '--context', 'b.md', '--out', 'o.txt', '--model', 'gemini-9', '--max-output-tokens', '123']);
  check('instructions-file parsed', args.instructionsFile === 'i.txt');
  check('repeated --context collects in order', args.contextFiles.length === 2 && args.contextFiles[0] === 'a.yml' && args.contextFiles[1] === 'b.md');
  check('--out parsed', args.out === 'o.txt');
  check('--model parsed', args.model === 'gemini-9');
  check('--max-output-tokens parsed and numeric', args.maxOutputTokens === 123);
}

{
  const args = parseArgs(['--instructions-text', 'inline text', '--out', 'o.txt']);
  check('instructions-text parsed', args.instructionsText === 'inline text');
  check('no --context -> empty array, not undefined', Array.isArray(args.contextFiles) && args.contextFiles.length === 0);
}

section('run-gemini-worker: --section parsing');

{
  const args = parseArgs(['--instructions-text', 'x', '--section', 'RESULTS=a.json', '--section', 'DIGEST=b.md']);
  check('two --section flags both parsed', args.sections.length === 2);
  check('first section name/path split correctly', args.sections[0].name === 'RESULTS' && args.sections[0].path === 'a.json');
  check('second section name/path split correctly', args.sections[1].name === 'DIGEST' && args.sections[1].path === 'b.md');
}

{
  const args = parseArgs(['--instructions-text', 'x', '--section', 'NOPATH']);
  check('a --section value with no "=" is silently dropped, not mis-split', args.sections.length === 0);
}

section('run-gemini-worker: extractSections');

{
  const text = 'preamble\n===RESULTS===\n[{"a":1}]\n===END_RESULTS===\nmiddle\n===DIGEST===\n# Digest\n\nbody\n===END_DIGEST===\ntrailer';
  const sections = [{ name: 'RESULTS', path: 'r.json' }, { name: 'DIGEST', path: 'd.md' }];
  const out = extractSections(text, sections);
  check('both sections extracted', out !== null && out.size === 2);
  check('RESULTS content extracted verbatim (minus wrapping newlines)', out.get('RESULTS') === '[{"a":1}]');
  check('DIGEST content extracted verbatim (minus wrapping newlines)', out.get('DIGEST') === '# Digest\n\nbody');
}

{
  const text = '===RESULTS===\n[]\n===END_RESULTS===';
  const out = extractSections(text, [{ name: 'RESULTS', path: 'r.json' }, { name: 'DIGEST', path: 'd.md' }]);
  check('missing one of two requested sections -> null, not a partial map', out === null);
}

{
  const out = extractSections('no delimiters here at all', [{ name: 'RESULTS', path: 'r.json' }]);
  check('a response with no delimiters at all -> null', out === null);
}

section('run-gemini-worker.mjs: CLI behavior (no network)');

{
  const script = join(process.cwd(), 'scripts', 'run-gemini-worker.mjs');
  const help = execFileSync('node', [script, '--help'], { encoding: 'utf8' });
  check('--help prints usage and mentions exit codes', help.includes('Usage:') && help.includes('75') && help.includes('GEMINI_API_KEY'));
}

{
  const script = join(process.cwd(), 'scripts', 'run-gemini-worker.mjs');
  let threw = false;
  let status = 0;
  try {
    execFileSync('node', [script], { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    threw = true;
    status = err.status;
  }
  check('missing required args exits non-zero (1)', threw && status === 1);
}

{
  const dir = mkdtempSync(join(tmpdir(), 'gemini-worker-test-'));
  const instructionsFile = join(dir, 'instructions.txt');
  const outFile = join(dir, 'out.txt');
  writeFileSync(instructionsFile, 'irrelevant — should fail before any network call');
  const script = join(process.cwd(), 'scripts', 'run-gemini-worker.mjs');
  let status = 0;
  try {
    execFileSync('node', [script, '--instructions-file', instructionsFile, '--out', outFile], {
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, GEMINI_API_KEY: '', PATH: process.env.PATH },
    });
  } catch (err) {
    status = err.status;
  }
  check('missing GEMINI_API_KEY fails closed with exit 2', status === 2);
  check('missing GEMINI_API_KEY writes nothing to --out', !existsSync(outFile));
  rmSync(dir, { recursive: true, force: true });
}

{
  // A pre-existing file at --out must survive a failed run unchanged — the
  // write is tmp-then-rename, so a crash before the network call (or a
  // rejected request) never truncates or corrupts a file callers may still
  // read for freshness (e.g. shortlist-sweep.sh's RUN_MARKER mtime check).
  const dir = mkdtempSync(join(tmpdir(), 'gemini-worker-test-'));
  const instructionsFile = join(dir, 'instructions.txt');
  const outFile = join(dir, 'out.txt');
  writeFileSync(instructionsFile, 'irrelevant');
  writeFileSync(outFile, 'yesterday\'s content');
  const script = join(process.cwd(), 'scripts', 'run-gemini-worker.mjs');
  try {
    execFileSync('node', [script, '--instructions-file', instructionsFile, '--out', outFile], {
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, GEMINI_API_KEY: '', PATH: process.env.PATH },
    });
  } catch {
    // expected: exit 2
  }
  check('a failed run leaves an existing --out file untouched', readFileSync(outFile, 'utf8') === 'yesterday\'s content');
  rmSync(dir, { recursive: true, force: true });
}

{
  // --section takes the same pre-network path as --out: no GEMINI_API_KEY
  // must fail before any section is written, with the same exit code.
  const dir = mkdtempSync(join(tmpdir(), 'gemini-worker-test-'));
  const instructionsFile = join(dir, 'instructions.txt');
  const resultsFile = join(dir, 'results.json');
  const digestFile = join(dir, 'digest.md');
  writeFileSync(instructionsFile, 'irrelevant');
  const script = join(process.cwd(), 'scripts', 'run-gemini-worker.mjs');
  let status = 0;
  try {
    execFileSync(
      'node',
      [script, '--instructions-file', instructionsFile, '--section', `RESULTS=${resultsFile}`, '--section', `DIGEST=${digestFile}`],
      { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, GEMINI_API_KEY: '', PATH: process.env.PATH } },
    );
  } catch (err) {
    status = err.status;
  }
  check('--section mode with missing GEMINI_API_KEY also fails closed with exit 2', status === 2);
  check('--section mode writes neither file on failure', !existsSync(resultsFile) && !existsSync(digestFile));
  rmSync(dir, { recursive: true, force: true });
}
