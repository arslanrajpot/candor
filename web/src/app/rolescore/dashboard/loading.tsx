export default function DashboardLoading() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10" aria-label="Loading your RoleScore dashboard">
      <div className="h-7 w-32 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-40 w-full animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-24 w-full animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-56 w-full animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
    </main>
  );
}
