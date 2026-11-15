"use client";

// Root error boundary: Next.js renders this instead of the page whenever a
// render/data error below it throws uncaught and nothing more specific (no
// closer error.tsx in the segment tree) handles it. Before this file existed,
// that fallback was Next's own default unstyled error screen — on a branded
// product, "the page looks broken" reads as "the product is broken."
// This still renders inside the root layout (its CSS vars/classes are
// already mounted), unlike global-error.tsx, which replaces <html> itself —
// see that file for the layout-crash case this one can't catch.
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center sm:px-6">
      <div className="flex size-12 items-center justify-center rounded-full border border-border bg-surface/70">
        <AlertTriangle className="size-5 text-red-500 dark:text-red-400" />
      </div>
      <div>
        <p className="text-base font-medium text-foreground">Something went wrong.</p>
        <p className="mt-1 text-sm text-muted">{error.message || "An unexpected error interrupted this page."}</p>
      </div>
      <button
        type="button"
        onClick={() => reset()}
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand max-sm:min-h-[44px]"
      >
        <RotateCcw className="size-3.5" /> Try again
      </button>
    </div>
  );
}
