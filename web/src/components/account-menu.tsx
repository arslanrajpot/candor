"use client";

import { useState } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/cn";

// Who's signed in, a way to their settings, and a way out. Rendered in the
// desktop sidebar and the mobile drawer from the owner the server resolved
// (src/lib/owner.ts). Sign-out only exists when the password gate is on —
// without it there is no session to end.
export function AccountMenu({
  name,
  initials,
  plan,
  canSignOut,
  className,
}: {
  name: string;
  initials: string;
  plan: string;
  canSignOut: boolean;
  className?: string;
}) {
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/dashboard-session", { method: "DELETE" });
    } finally {
      // Hard navigation: drop every client-side cache of the signed-in app.
      window.location.href = "/welcome";
    }
  }

  return (
    <div className={cn("flex items-center gap-1 rounded-xl border border-border bg-surface/50 p-1.5", className)}>
      <Link
        href="/config"
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-surface-hover max-sm:min-h-[44px]"
        aria-label={`${name} — settings`}
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-text"
        >
          {initials}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-medium text-foreground">{name}</span>
          <span className="block truncate text-[11px] text-faint">{plan} plan</span>
        </span>
      </Link>
      {canSignOut && (
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          title="Sign out"
          aria-label="Sign out"
          className="inline-flex shrink-0 items-center justify-center rounded-lg p-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-50 max-sm:min-h-[44px] max-sm:min-w-[44px]"
        >
          <LogOut className="size-4" />
        </button>
      )}
    </div>
  );
}
