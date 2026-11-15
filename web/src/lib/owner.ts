import fs from "node:fs";
import * as yaml from "js-yaml";
import { careerOpsRoot } from "@/lib/career-ops";
import { getProfilePath } from "@/lib/core/profile-path.mjs";

export type Owner = { name: string; email: string | null; plan: string };

// The one place that answers "who is using this dashboard?". Today there is a
// single owner, read from config/profile.yml. A hosted multi-user version
// replaces the body of this function with a session lookup (and a per-user data
// root — see careerOpsRoot()); everything that renders an account keeps working
// unchanged because it only ever calls this.
export function currentOwner(): Owner {
  try {
    const profile = yaml.load(fs.readFileSync(getProfilePath(careerOpsRoot()), "utf8")) as
      | { candidate?: { full_name?: unknown; email?: unknown } }
      | undefined;
    const name = typeof profile?.candidate?.full_name === "string" ? profile.candidate.full_name.trim() : "";
    const email = typeof profile?.candidate?.email === "string" ? profile.candidate.email.trim() : "";
    return { name: name || "You", email: email || null, plan: "Personal" };
  } catch {
    return { name: "You", email: null, plan: "Personal" };
  }
}

/** Up to two initials for the avatar. */
export function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}
