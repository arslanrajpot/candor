"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ApiKey = {
  id: string;
  provider: string;
  label: string | null;
  base_url: string | null;
  model: string | null;
  created_at: string;
};

type RiskFlag = { type: string; detail: string };

type EvalResult = {
  id?: string;
  score: number;
  verdict: string;
  strengths: string[];
  gaps: string[];
  risk_flags: RiskFlag[];
  reasoning: string;
};

type HistoryRow = {
  id: string;
  jdText: string;
  provider: string;
  model: string | null;
  score: number;
  verdict: string;
  result: EvalResult;
  createdAt: string;
};

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function DashboardClient({ email }: { email: string }) {
  const router = useRouter();

  const [resume, setResume] = useState("");
  const [resumeSavedAt, setResumeSavedAt] = useState<string | null>(null);
  const [resumeSaving, setResumeSaving] = useState(false);

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [providers, setProviders] = useState<{ id: string; label: string }[]>([]);
  const [newKey, setNewKey] = useState({ provider: "", apiKey: "", label: "", baseUrl: "", model: "" });
  const [keyError, setKeyError] = useState<string | null>(null);
  const [addingKey, setAddingKey] = useState(false);

  const [selectedKeyId, setSelectedKeyId] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [result, setResult] = useState<EvalResult | null>(null);

  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    fetch("/api/rolescore/resume")
      .then(jsonOrThrow)
      .then((d) => {
        setResume(d.content || "");
        setResumeSavedAt(d.updatedAt);
      })
      .catch(() => {});

    fetch("/api/rolescore/keys")
      .then(jsonOrThrow)
      .then((d) => {
        setKeys(d.keys || []);
        setProviders(d.providers || []);
        if (d.providers?.[0]) setNewKey((k) => ({ ...k, provider: d.providers[0].id }));
        if (d.keys?.[0]) setSelectedKeyId(d.keys[0].id);
      })
      .catch(() => {});

    fetch("/api/rolescore/evaluations")
      .then(jsonOrThrow)
      .then((d) => setHistory(d.evaluations || []))
      .catch(() => {});
  }, []);

  async function saveResume() {
    setResumeSaving(true);
    try {
      const data = await jsonOrThrow(
        await fetch("/api/rolescore/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: resume }),
        }),
      );
      setResumeSavedAt(data.updatedAt);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save resume.");
    } finally {
      setResumeSaving(false);
    }
  }

  async function addKey(e: React.FormEvent) {
    e.preventDefault();
    setKeyError(null);
    setAddingKey(true);
    try {
      const data = await jsonOrThrow(
        await fetch("/api/rolescore/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newKey),
        }),
      );
      const refreshed = await jsonOrThrow(await fetch("/api/rolescore/keys"));
      setKeys(refreshed.keys || []);
      setSelectedKeyId(data.key.id);
      setNewKey({ provider: newKey.provider, apiKey: "", label: "", baseUrl: "", model: "" });
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : "Failed to add key.");
    } finally {
      setAddingKey(false);
    }
  }

  async function deleteKey(id: string) {
    if (!confirm("Remove this API key? This can't be undone.")) return;
    await fetch(`/api/rolescore/keys/${id}`, { method: "DELETE" }).catch(() => {});
    setKeys((prev) => prev.filter((k) => k.id !== id));
    if (selectedKeyId === id) setSelectedKeyId("");
  }

  async function runEvaluation(e: React.FormEvent) {
    e.preventDefault();
    setEvalError(null);
    setEvaluating(true);
    setResult(null);
    try {
      const data = await jsonOrThrow(
        await fetch("/api/rolescore/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyId: selectedKeyId, jobDescription }),
        }),
      );
      setResult(data.result);
      const refreshed = await jsonOrThrow(await fetch("/api/rolescore/evaluations"));
      setHistory(refreshed.evaluations || []);
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : "Evaluation failed.");
    } finally {
      setEvaluating(false);
    }
  }

  async function logout() {
    await fetch("/api/rolescore/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/rolescore");
    router.refresh();
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-semibold">RoleScore</h1>
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <span>{email}</span>
          <button onClick={logout} className="underline">
            Sign out
          </button>
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Your resume</h2>
        <textarea
          value={resume}
          onChange={(e) => setResume(e.target.value)}
          rows={8}
          placeholder="Paste your resume as plain text…"
          className="rounded-lg border border-zinc-300 bg-white p-3 text-sm outline-none focus:border-[var(--color-brand)] dark:border-zinc-700 dark:bg-zinc-900"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={saveResume}
            disabled={resumeSaving}
            className="w-fit rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-[var(--color-brand-foreground)] disabled:opacity-60"
          >
            {resumeSaving ? "Saving…" : "Save resume"}
          </button>
          {resumeSavedAt && (
            <span className="text-xs text-zinc-500">Saved {new Date(resumeSavedAt).toLocaleString()}</span>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Your AI keys</h2>
        <p className="text-xs text-zinc-500">
          Stored encrypted. Each evaluation uses your own key — you pay your own provider directly, nothing is
          shared or billed by RoleScore.
        </p>
        <ul className="flex flex-col gap-2">
          {keys.map((k) => (
            <li
              key={k.id}
              className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <span>
                {k.label ? `${k.label} — ` : ""}
                {providers.find((p) => p.id === k.provider)?.label || k.provider}
                {k.model ? ` (${k.model})` : ""}
              </span>
              <button onClick={() => deleteKey(k.id)} className="text-xs text-red-600 underline dark:text-red-400">
                Remove
              </button>
            </li>
          ))}
          {keys.length === 0 && <li className="text-sm text-zinc-500">No keys added yet.</li>}
        </ul>

        <form onSubmit={addKey} className="flex flex-col gap-2 rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={newKey.provider}
              onChange={(e) => setNewKey({ ...newKey, provider: e.target.value })}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <input
              placeholder="Label (optional)"
              value={newKey.label}
              onChange={(e) => setNewKey({ ...newKey, label: e.target.value })}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <input
            type="password"
            required
            placeholder="API key"
            value={newKey.apiKey}
            onChange={(e) => setNewKey({ ...newKey, apiKey: e.target.value })}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Model (optional, e.g. gpt-4o-mini)"
              value={newKey.model}
              onChange={(e) => setNewKey({ ...newKey, model: e.target.value })}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <input
              placeholder="Base URL (optional, OpenAI-compatible only)"
              value={newKey.baseUrl}
              onChange={(e) => setNewKey({ ...newKey, baseUrl: e.target.value })}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          {keyError && <p className="text-sm text-red-600 dark:text-red-400">{keyError}</p>}
          <button
            type="submit"
            disabled={addingKey}
            className="w-fit rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            {addingKey ? "Adding…" : "Add key"}
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Evaluate a job</h2>
        <form onSubmit={runEvaluation} className="flex flex-col gap-2">
          <select
            value={selectedKeyId}
            onChange={(e) => setSelectedKeyId(e.target.value)}
            className="w-fit rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Choose a key…</option>
            {keys.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label || providers.find((p) => p.id === k.provider)?.label || k.provider}
              </option>
            ))}
          </select>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            rows={8}
            placeholder="Paste the job description…"
            className="rounded-lg border border-zinc-300 bg-white p-3 text-sm outline-none focus:border-[var(--color-brand)] dark:border-zinc-700 dark:bg-zinc-900"
          />
          {evalError && <p className="text-sm text-red-600 dark:text-red-400">{evalError}</p>}
          <button
            type="submit"
            disabled={evaluating || !selectedKeyId}
            className="w-fit rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-[var(--color-brand-foreground)] disabled:opacity-60"
          >
            {evaluating ? "Evaluating…" : "Evaluate fit"}
          </button>
        </form>

        {result && (
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{result.score.toFixed(1)}/5</span>
              <span className="text-sm text-zinc-500">{result.verdict}</span>
            </div>
            <p className="mt-2 text-sm">{result.reasoning}</p>
            {result.strengths.length > 0 && (
              <div className="mt-3">
                <h3 className="text-sm font-medium">Strengths</h3>
                <ul className="list-inside list-disc text-sm text-zinc-600 dark:text-zinc-400">
                  {result.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.gaps.length > 0 && (
              <div className="mt-3">
                <h3 className="text-sm font-medium">Gaps</h3>
                <ul className="list-inside list-disc text-sm text-zinc-600 dark:text-zinc-400">
                  {result.gaps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.risk_flags.length > 0 && (
              <div className="mt-3">
                <h3 className="text-sm font-medium">Risk flags</h3>
                <ul className="list-inside list-disc text-sm text-amber-600 dark:text-amber-400">
                  {result.risk_flags.map((f, i) => (
                    <li key={i}>
                      <span className="font-medium">{f.type}:</span> {f.detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">History</h2>
        <ul className="flex flex-col gap-2">
          {history.map((h) => (
            <li key={h.id} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {h.score.toFixed(1)}/5 — {h.verdict}
                </span>
                <span className="text-xs text-zinc-500">{new Date(h.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{h.jdText}</p>
            </li>
          ))}
          {history.length === 0 && <li className="text-sm text-zinc-500">No evaluations yet.</li>}
        </ul>
      </section>
    </main>
  );
}
