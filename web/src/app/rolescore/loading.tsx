export default function RoleScoreLoading() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-16" aria-label="Loading RoleScore">
      <div className="h-7 w-36 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-4 h-10 w-full max-w-sm animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
    </main>
  );
}
