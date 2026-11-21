"use client";

import { useState } from "react";

export function LoginForm({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(
    initialError === "expired-link" ? "That link has expired or was already used. Request a new one." : null,
  );
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<{ emailSent: boolean; devLink?: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/rolescore/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, inviteCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't send a sign-in link.");
      setSent({ emailSent: data.emailSent, devLink: data.devLink });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send a sign-in link.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-3 text-center">
        {sent.emailSent ? (
          <p className="text-sm">
            Check <strong>{email}</strong> for a sign-in link. It expires in 15 minutes.
          </p>
        ) : (
          <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-left text-sm dark:bg-amber-950">
            <p className="font-medium text-amber-800 dark:text-amber-300">
              Email isn&apos;t configured yet — here&apos;s your link (dev mode only):
            </p>
            <a href={sent.devLink} className="mt-2 block break-all text-xs underline">
              {sent.devLink}
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-3">
      <input
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] dark:border-zinc-700 dark:bg-zinc-900"
      />
      <input
        type="text"
        placeholder="Invite code (if you have one)"
        value={inviteCode}
        onChange={(e) => setInviteCode(e.target.value)}
        className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] dark:border-zinc-700 dark:bg-zinc-900"
      />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-[var(--color-brand-foreground)] disabled:opacity-60"
      >
        {loading ? "Sending…" : "Send sign-in link"}
      </button>
      <p className="text-xs text-zinc-500">
        No password. We&apos;ll email you a one-time link that signs you into (or creates) your account.
      </p>
    </form>
  );
}
