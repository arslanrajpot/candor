// The one place that reads the RoleScore session cookie — kept separate from
// session.mjs's pure token logic so that module stays importable under plain
// `node --test` (next/headers only resolves inside Next's own runtime).
import { cookies } from "next/headers";
import { ROLESCORE_SESSION_COOKIE, verifySessionToken } from "@/lib/rolescore/session.mjs";

/** Reads the current request's session cookie (Node runtime: server components, route handlers). */
export async function getSessionUserId() {
  const store = await cookies();
  return verifySessionToken(store.get(ROLESCORE_SESSION_COOKIE)?.value);
}
