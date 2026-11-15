"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Receipt, Coins, Info } from "lucide-react";
import { useJobs } from "@/components/jobs/job-store";
import { formatTokenCount } from "@/lib/run-cost-estimate.mjs";
import { costHistory, summarizeUsage } from "@/lib/usage-history.mjs";
import { cn } from "@/lib/cn";

function fmtUsd(usd: number): string {
  return `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
}

export default function UsagePage() {
  const { jobs } = useJobs();
  const summary = useMemo(() => summarizeUsage(jobs), [jobs]);
  const rows = useMemo(() => costHistory(jobs), [jobs]);
  const allUsdKnown = summary.runCount === 0 || summary.usdKnownRuns === summary.runCount;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-landing">Usage</h1>
        <p className="mt-1 text-sm text-muted">What each run cost — Evaluate, Generate CV, and Cover letter are the only kinds that spend tokens.</p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Total spend" value={summary.runCount === 0 ? "—" : fmtUsd(summary.totalUsd)} sub={allUsdKnown ? undefined : `at least — ${summary.usdKnownRuns}/${summary.runCount} runs reported a $ figure`} />
        <StatTile label="Total tokens" value={summary.runCount === 0 ? "—" : formatTokenCount(summary.totalTokens)} />
        <StatTile label="Runs" value={String(summary.runCount)} />
      </div>

      {summary.byKind.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {summary.byKind.map((k) => (
            <span key={k.kind} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/40 px-3 py-1 text-xs text-muted">
              <span className="font-medium text-foreground">{k.label}</span>
              <span className="tabular-nums">{k.count}</span> ·{" "}
              <span className="tabular-nums">{formatTokenCount(k.tokens)} tok</span>
              {k.usdKnownRuns > 0 && (
                <>
                  {" "}
                  · <span className="tabular-nums">{fmtUsd(k.usd)}</span>
                </>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-border bg-surface/30 px-3 py-2 text-xs text-faint">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          This is your browser&apos;s own run history, not a server ledger — it keeps at most the 40 most recent runs and lives only in this
          browser (a different device or cleared site data starts over). For your AI CLI&apos;s account-wide rate-limit usage, see{" "}
          <Link href="/config" className="underline-offset-2 hover:underline">
            Config
          </Link>
          .
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface/30 px-6 py-12 text-center text-sm text-muted">
          No cost-bearing runs yet. Evaluate, Generate CV, or Draft cover letter will show up here once one finishes.
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/40">
          {rows.map((j) => (
            <li key={j.id}>
              <Link href={`/jobs/${j.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover">
                <Receipt className="size-4 shrink-0 text-faint" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{j.title}</div>
                  {j.subtitle && <div className="truncate text-xs text-muted">{j.subtitle}</div>}
                </div>
                <span className="hidden shrink-0 text-xs tabular-nums text-faint sm:block">{new Date(j.startedAt).toLocaleString()}</span>
                <span className="shrink-0 rounded-md bg-surface-hover px-1.5 py-0.5 text-xs tabular-nums text-muted">
                  {formatTokenCount(j.cost!.tokens)} tok
                </span>
                <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums", typeof j.cost!.usd === "number" ? "bg-brand-soft text-brand" : "bg-surface-hover text-faint")}>
                  <Coins className="size-3" /> {typeof j.cost!.usd === "number" ? fmtUsd(j.cost!.usd) : "?"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      {sub && <div className="mt-1 text-xs text-faint">{sub}</div>}
    </div>
  );
}
