// Where to send someone after sign-in. The `next` query value is attacker
// controlled (a link can carry any string), so only a path on THIS site is
// honoured. "//evil.com" and "/\evil.com" both begin with "/" yet browsers read
// them as another host, which would turn the sign-in page into an open
// redirect; control characters are rejected for the same reason (a browser
// strips tabs/newlines inside a URL, so "/\t/evil.com" collapses to "//evil.com").

/** @param {unknown} next @returns {string} a same-site absolute path, or "/" */
export function safeNextPath(next) {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return "/";
  // Never bounce back into the sign-in page itself.
  if (next === "/dashboard-login" || next.startsWith("/dashboard-login?")) return "/";
  return next;
}
