"use client";

// A real confirm step before a one-click action that spends tokens/money
// (Evaluate, Generate PDF, Draft cover letter). Before this, those buttons
// fired startJob() directly on click — a mis-click or double-click spent
// money a second time with nothing in the way. This mirrors the assistant
// console's own ConfirmationCard styling (ConfirmationCard in
// assistant-console.tsx) so a spend-confirm looks the same whether it comes
// from the chat assistant or a direct button — one visual language for "this
// is about to cost something," not two.
export function SpendConfirm({
  summary,
  onConfirm,
  onCancel,
}: {
  summary: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="group" aria-label={summary} className="rounded-xl border border-brand/40 bg-brand-soft p-2.5">
      <div className="text-xs font-medium text-foreground">{summary}</div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          aria-label={`Confirm: ${summary}`}
          onClick={onConfirm}
          className="rounded-full bg-brand px-3 py-1 text-xs font-medium text-brand-foreground transition-colors hover:bg-brand-200 max-sm:min-h-[44px]"
        >
          Confirm
        </button>
        <button
          type="button"
          aria-label={`Cancel: ${summary}`}
          onClick={onCancel}
          className="rounded-full border border-border px-3 py-1 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground max-sm:min-h-[44px]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
