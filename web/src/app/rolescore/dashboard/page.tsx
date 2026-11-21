import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/rolescore/current-user.mjs";
import { getDb } from "@/lib/rolescore/db.mjs";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/rolescore");

  const user = getDb().prepare("SELECT email FROM users WHERE id = ?").get(userId) as
    | { email: string }
    | undefined;
  if (!user) redirect("/rolescore");

  return <DashboardClient email={user.email} />;
}
