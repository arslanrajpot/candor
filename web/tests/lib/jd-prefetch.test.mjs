import { test } from "node:test";
import assert from "node:assert/strict";
import { prefetchJdText, landedOnSamePosting, isHttpUrl, MIN_JD_CHARS } from "../../src/lib/jd-prefetch.mjs";

const URL_ = "https://boards.greenhouse.io/acme/jobs/4470724009";
const BODY = "Senior Backend Engineer. ".repeat(40); // > MIN_JD_CHARS

// A fake execFile keyed on which core script was asked for.
const fakeExec = (handlers) => async (_node, args) => {
  const script = args[0].split("/").pop();
  const h = handlers[script];
  if (!h) throw new Error("not found");
  return h(args);
};

test("only http(s) URLs are fetched", async () => {
  assert.equal(isHttpUrl("https://x.com/a"), true);
  assert.equal(isHttpUrl("file:///etc/passwd"), false);
  assert.equal(isHttpUrl("javascript:alert(1)"), false);
  assert.equal(await prefetchJdText("file:///etc/passwd", "/root", { exec: fakeExec({}) }), null);
  assert.equal(await prefetchJdText("pasted job text, not a url", "/root", { exec: fakeExec({}) }), null);
});

test("uses the ATS API text when it answers with a real body", async () => {
  const exec = fakeExec({ "fetch-jd.mjs": () => ({ stdout: BODY }) });
  const got = await prefetchJdText(URL_, "/root", { exec });
  assert.equal(got.via, "ats-api");
  assert.ok(got.text.length >= MIN_JD_CHARS);
});

test("falls back to the rendered page when the ATS API misses", async () => {
  const exec = fakeExec({
    "browser-extract.mjs": () => ({ stdout: JSON.stringify({ url: URL_, title: "Senior Backend Engineer", text: BODY }) }),
  });
  const got = await prefetchJdText(URL_, "/root", { exec });
  assert.equal(got.via, "browser");
  assert.ok(got.text.startsWith("Senior Backend Engineer"));
});

test("a thin page (consent wall, unrendered shell) is not a posting", async () => {
  const exec = fakeExec({
    "fetch-jd.mjs": () => ({ stdout: "Loading…" }),
    "browser-extract.mjs": () => ({ stdout: JSON.stringify({ url: URL_, title: "x", text: "Accept cookies" }) }),
  });
  assert.equal(await prefetchJdText(URL_, "/root", { exec }), null);
});

test("a redirect to the generic careers list is not this posting", async () => {
  const exec = fakeExec({
    "browser-extract.mjs": () => ({ stdout: JSON.stringify({ url: "https://acme.com/careers/jobs/", title: "Careers", text: BODY }) }),
  });
  assert.equal(await prefetchJdText(URL_, "/root", { exec }), null);
});

test("landedOnSamePosting keeps the job id across ATS host redirects", () => {
  assert.equal(landedOnSamePosting(URL_, "https://job-boards.greenhouse.io/acme/jobs/4470724009"), true);
  assert.equal(landedOnSamePosting(URL_, "https://acme.com/careers/jobs/"), false);
  assert.equal(landedOnSamePosting("https://acme.com/careers?gh_jid=77", "https://acme.com/careers?gh_jid=77"), true);
  assert.equal(landedOnSamePosting("not a url", "https://acme.com"), false);
});

test("a failing child process is a miss, never a throw", async () => {
  const exec = async () => {
    throw new Error("boom");
  };
  assert.equal(await prefetchJdText(URL_, "/root", { exec }), null);
});
