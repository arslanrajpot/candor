"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ApplyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex items-start gap-2 rounded-xl border border-border bg-surface/70 p-4">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500 dark:text-red-400" />
        <div>
          <p className="text-sm font-medium text-foreground">Could not load this apply checklist.</p>
          <p className="mt-1 text-sm text-muted">{error.message || "The report or related files could not be read."}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand max-sm:min-h-[44px]"
      >
        <RotateCcw className="size-3.5" /> Try again
      </button>
    </div>
  );
}
