import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoginLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10" aria-label="Loading sign in">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface/50 p-7 sm:p-9">
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-[30px] rounded-md" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="mt-6 h-3 w-40" />
        <Skeleton className="mt-3 h-8 w-44" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-7 h-12 w-full rounded-lg" />
        <Skeleton className="mt-7 h-11 w-full rounded-full" />
      </div>
    </main>
  );
}
