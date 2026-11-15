"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { CandorMark } from "@/components/candor-mark";
import { AssistantConsole } from "@/components/assistant-console";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { BackToTop } from "@/components/back-to-top";
import { JobsProvider } from "@/components/jobs/job-store";
import { PipelineProvider } from "@/components/pipeline/pipeline-provider";
import { ApplyProvider } from "@/components/apply/apply-provider";
import { ExploreProvider } from "@/components/explore/explore-provider";
import { FirstScoreView } from "@/components/explore/first-score-view";
import { BetaBanner } from "@/components/beta/beta-banner";
import { WorkerPills } from "@/components/jobs/worker-pills";
import { UsageMeter } from "@/components/usage-meter";
import { AccountMenu } from "@/components/account-menu";
import { instrumentSerif } from "@/lib/fonts";
import { BRAND } from "@/lib/brand";
import { isPublicPage } from "@/lib/public-routes.mjs";
import { visibleNavItems, isActivePath } from "@/lib/nav-items";

export type ShellAccount = { name: string; initials: string; plan: string; canSignOut: boolean };

export function AppShell({
  children,
  followupsEnabled,
  account,
}: {
  children: React.ReactNode;
  followupsEnabled: boolean;
  account: ShellAccount;
}) {
  const pathname = usePathname();
  // Public pages (landing, sign-in) render bare: no sidebar, no data providers,
  // no assistant — a signed-out visitor has no data to load and would only hit
  // 401s from the providers.
  if (isPublicPage(pathname)) return <main className="min-h-screen">{children}</main>;
  return (
    <JobsProvider>
      <PipelineProvider>
      <ApplyProvider>
      <ExploreProvider>
      <MobileNav followupsEnabled={followupsEnabled} account={account} />
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface/30 p-4 md:flex">
          <Link href="/" className="mb-8 flex items-center gap-2.5 px-1">
            <CandorMark size={32} />
            <span className={`${instrumentSerif.className} relative -top-px text-2xl font-normal tracking-tight text-landing`}>
              {BRAND.name}
            </span>
          </Link>
          <nav className="flex flex-col gap-1">
            {visibleNavItems(followupsEnabled).map(({ href, label, icon: Icon, chip }) => {
              const active = isActivePath(href, pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-brand-soft text-brand-text"
                      : "text-muted hover:bg-surface-hover hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                  {chip && (
                    <span className="ml-auto rounded-full border border-brand/30 bg-brand-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-text">
                      {chip}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <WorkerPills />

          <div className="mt-auto space-y-3 pb-16 pt-4">
            <AccountMenu {...account} />
            <UsageMeter />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">Appearance</span>
                <span className="font-mono text-[10px] text-faint">THEME</span>
              </div>
              <ThemeToggle showLabel />
              <div className="px-1">
                <span className={`${instrumentSerif.className} text-sm text-faint`}>local-first · v0</span>
              </div>
            </div>
          </div>
        </aside>
        <main className="flex-1 overflow-x-hidden">{children}</main>
        <AssistantConsole />
        <BackToTop />
        <FirstScoreView />
        <BetaBanner />
      </div>
      </ExploreProvider>
      </ApplyProvider>
      </PipelineProvider>
    </JobsProvider>
  );
}
