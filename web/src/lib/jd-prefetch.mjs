// Fetch a posting's text on the server, before the agent runs.
//
// The web "Evaluate" worker is deliberately headless with no shell and no
// browser, so it reads postings with WebFetch — which returns an empty shell
// for JavaScript-rendered boards (Greenhouse job-boards, Ashby, Workday…) and
// made every such evaluation end as "posting appears closed". The nightly
// digest/batch pipeline already solves this by fetching in a plain Node step
// and handing the agent text; this does the same for the button, using the
// same two core scripts, so the two paths cannot disagree about what a
// fetchable posting is:
//   1. fetch-jd.mjs        — the ATS's own public JSON API (exact body, free)
//   2. browser-extract.mjs — a rendered page, for everything else
// The agent still gets no new tools. Returns null on a miss, and the caller
// falls back to the old WebFetch path rather than inventing a posting.

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// A real posting body is several paragraphs; anything shorter is a consent
// wall, a login redirect or an unrendered shell, which must not be scored.
export const MIN_JD_CHARS = 400;
export const MAX_JD_CHARS = 20_000;

export function isHttpUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Did the rendered page end up on THIS posting? A closed job usually redirects
 * to the company's generic careers list, which is long enough to look like a
 * posting but is not one. The job's own id/slug (last path segment of the
 * requested URL) must survive into the final URL.
 */
export function landedOnSamePosting(requestedUrl, finalUrl) {
  try {
    const req = new URL(requestedUrl);
    const fin = new URL(finalUrl);
    const last = req.pathname.split("/").filter(Boolean).pop();
    if (!last) return true; // nothing distinguishing to compare
    return (fin.pathname + fin.search).includes(last) || fin.search === req.search && req.search !== "";
  } catch {
    return false;
  }
}

/**
 * @param {string} url
 * @param {string} root career-ops checkout (holds fetch-jd.mjs / browser-extract.mjs)
 * @param {{ exec?: typeof execFileAsync }} [deps] injectable for tests
 * @returns {Promise<{ text: string, via: "ats-api" | "browser" } | null>}
 */
export async function prefetchJdText(url, root, { exec = execFileAsync } = {}) {
  if (!isHttpUrl(url)) return null;

  // Arguments go straight to the child (no shell), so a URL cannot inject a command.
  try {
    const { stdout } = await exec(process.execPath, [path.join(/* turbopackIgnore: true */ root, "fetch-jd.mjs"), url], {
      cwd: root,
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const text = String(stdout).trim();
    if (text.length >= MIN_JD_CHARS) return { text: text.slice(0, MAX_JD_CHARS), via: "ats-api" };
  } catch {
    // Expected for hosts without a public JD API — fall through to the browser.
  }

  try {
    const { stdout } = await exec(
      process.execPath,
      [path.join(/* turbopackIgnore: true */ root, "browser-extract.mjs"), url, "--mode", "jd", "--timeout", "15000"],
      { cwd: root, timeout: 45_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const parsed = JSON.parse(String(stdout));
    if (parsed?.url && !landedOnSamePosting(url, parsed.url)) return null; // redirected away: not this posting
    const body = String(parsed?.text ?? "").trim();
    const title = String(parsed?.title ?? "").trim();
    const text = title && !body.startsWith(title) ? `${title}\n\n${body}` : body;
    if (body.length >= MIN_JD_CHARS) return { text: text.slice(0, MAX_JD_CHARS), via: "browser" };
  } catch {
    // Browser unavailable or the page would not render — caller falls back.
  }

  return null;
}
