import { Skeleton } from "@/components/ui/skeleton";

export default function WelcomeLoading() {
  return (
    <main className="min-h-screen" aria-label="Loading">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-[30px] rounded-md" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="h-9 w-20 rounded-full" />
      </div>
      <div className="mx-auto max-w-5xl px-6 pt-16 text-center md:pt-24">
        <Skeleton className="mx-auto h-6 w-56 rounded-full" />
        <Skeleton className="mx-auto mt-6 h-16 w-full max-w-3xl" />
        <Skeleton className="mx-auto mt-6 h-5 w-full max-w-2xl" />
        <div className="mt-9 flex justify-center gap-3">
          <Skeleton className="h-11 w-44 rounded-full" />
          <Skeleton className="h-11 w-32 rounded-full" />
        </div>
      </div>
    </main>
  );
}
