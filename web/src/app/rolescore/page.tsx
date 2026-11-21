import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/rolescore/session.mjs";
import { LoginForm } from "./login-form";

export default async function RoleScoreHome({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const userId = await getSessionUserId();
  if (userId) redirect("/rolescore/dashboard");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="max-w-lg text-center">
        <h1 className="text-3xl font-display font-semibold">RoleScore</h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          Paste your resume once. Bring your own OpenAI, Anthropic, Gemini, or OpenRouter key. Paste any job
          description and get an honest fit score — your data and your API spend never touch anyone else's.
        </p>
      </div>
      <LoginForm initialError={error} />
    </main>
  );
}
