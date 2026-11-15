"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CandorMark } from "@/components/candor-mark";
import { HeroGlow } from "@/components/hero-glow";
import { instrumentSerif } from "@/lib/fonts";
import { BRAND } from "@/lib/brand";
import { safeNextPath } from "@/lib/safe-redirect.mjs";
import Link from "next/link";

// Login page for the optional dashboard password gate (src/proxy.ts). Distinct
// from /login, which is the job-application flow's sign-in UI for third-party
// ATS accounts (src/app/api/apply/session) — unrelated to dashboard access.
//
// Same product chrome as the first-run home (dot-bg + HeroGlow + CandorMark):
// this is often the very first screen anyone sees — on a phone, over the
// public Funnel URL — so it should read as the app, not as a bolted-on gate.

export default function DashboardLoginPage() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/dashboard-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Could not sign in.");
        setSubmitting(false);
        return;
      }
      // A hard navigation, not router.replace/refresh: Next's client-side
      // router cache can hold onto an RSC payload fetched for this route
      // *before* login (a background prefetch, say) and would otherwise
      // replay that stale "not authenticated" render even though the cookie
      // we just got back is good — reported live as "stays on the login
      // page, no error" after a password that the server actually accepted.
      // A full reload can't hit that cache; it always re-asks the server.
      window.location.href = safeNextPath(searchParams.get("next"));
      return;
    } catch {
      setError("Could not reach the server.");
      setSubmitting(false);
    }
  }

  return (
    <main className="dot-bg relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <HeroGlow />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] bg-background/55 backdrop-blur-[2px]"
      />
      <Card corner="br" elevated className="relative z-10 w-full max-w-sm p-0">
        <form onSubmit={onSubmit} className="p-7 sm:p-9">
          <div className="flex items-center gap-2.5">
            <CandorMark size={30} />
            <span className="text-sm font-medium text-foreground">{BRAND.name}</span>
          </div>

          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            <span className="text-faint">//</span> private · local-first
          </p>
          <h1 className={`${instrumentSerif.className} mt-2 text-3xl leading-tight text-landing`}>
            Welcome back
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Enter your password to open the dashboard.
          </p>

          <div className="mt-7">
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground">
              Password
            </label>
            <div className="relative">
              <Lock
                aria-hidden
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint"
              />
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error ? true : undefined}
                className="h-12 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-[15px] text-foreground outline-none transition-colors focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30"
              />
            </div>
          </div>

          {error ? (
            <p role="alert" className="mt-3 text-sm text-red-500">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={submitting || password.length === 0}
            className="mt-7 w-full rounded-full"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </Button>

          <p className="mt-5 text-center text-xs text-faint">
            <Link href="/welcome" className="underline-offset-2 hover:text-foreground hover:underline">
              About {BRAND.name}
            </Link>
          </p>
        </form>
      </Card>
    </main>
  );
}
