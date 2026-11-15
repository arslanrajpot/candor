"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useJobs } from "@/components/jobs/job-store";
import { CostBadge } from "@/components/cost/cost-badge";
import { SpendConfirm } from "@/components/cost/spend-confirm";
import { estimateRunCost, formatRunCostEstimate } from "@/lib/run-cost-estimate.mjs";

// Auto-pipeline, one click: paste a job URL → fire a real evaluation worker
// (the same kind:"evaluate" that runs modes/oferta.md + writes the A–F report +
// tracker row). The worker pills + assistant cards show progress.
export function QuickEvaluate() {
  const { jobs, startJob } = useJobs();
  const [url, setUrl] = useState("");
  const [hint, setHint] = useState("");
  const [confirming, setConfirming] = useState(false);
  // Evaluate spends real tokens, so a running job for this exact URL (another
  // tab, a prior click not yet cleared) must block a second one — the same
  // check-the-job-list pattern used by GeneratePdfButton and CoverDraftButton.
  // The backend also guards this (run-registry's in-flight set, 409 on a
  // duplicate); this is the client-side half, for immediate feedback.
  const u = url.trim();
  const alreadyRunning = useMemo(
    () => u !== "" && jobs.some((j) => j.kind === "evaluate" && j.input === u && j.status === "running"),
    [jobs, u],
  );

  function run() {
    if (!/^https?:\/\//i.test(u)) {
      setHint("Paste a full job-posting URL (https://…).");
      return;
    }
    if (alreadyRunning) {
      setHint("Already evaluating that URL — check the Workers tray.");
      return;
    }
    setConfirming(true);
  }

  function fire() {
    startJob({ title: "Evaluate · pasted URL", subtitle: u, kind: "evaluate", input: u, page: "/" });
    setConfirming(false);
    setUrl("");
    setHint("Evaluating — watch it in the Workers tray.");
  }

  const estimate = useMemo(() => estimateRunCost(jobs, "evaluate"), [jobs]);

  return (
    <div className="mt-7">
      <div className="flex max-w-xl items-center gap-2 rounded-full border border-border bg-surface/70 py-1.5 pl-4 pr-1.5 shadow-sm focus-within:border-brand/50">
        <Sparkles className="size-4 shrink-0 text-brand/70" />
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (hint) setHint("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
          }}
          placeholder="Paste a job URL to evaluate…"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-faint"
        />
        <button
          onClick={run}
          disabled={alreadyRunning}
          className="shrink-0 rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {alreadyRunning ? "Evaluating…" : "Evaluate"}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <CostBadge kind="spend" size="xs" />
        <span className="text-xs text-faint">Evaluation runs on your own AI — your key, your machine.</span>
      </div>
      {confirming && (
        <div className="mt-2 max-w-xl">
          <SpendConfirm
            summary={`Evaluate this posting? (${formatRunCostEstimate(estimate)})`}
            onConfirm={fire}
            onCancel={() => setConfirming(false)}
          />
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}
