import Link from "next/link";
import { ArrowRight, Compass, FileText, Gauge, Hand, ShieldCheck, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CandorMark } from "@/components/candor-mark";
import { HeroGlow } from "@/components/hero-glow";
import { ThemeToggle } from "@/components/theme-toggle";
import { instrumentSerif } from "@/lib/fonts";
import { BRAND } from "@/lib/brand";

// Public product page — what a signed-out visitor sees at "/". Copy describes
// what the product actually does today; it makes no claims about pricing,
// customers or numbers that don't exist. Rendered outside the app shell (see
// src/lib/public-routes.mjs).

const FEATURES = [
  {
    icon: Compass,
    title: "Finds roles at scale",
    body: "Scans company career pages and job boards every morning, pulling postings straight from the source into your inbox.",
  },
  {
    icon: Gauge,
    title: "Scores them honestly",
    body: "Every posting is judged against your real CV. Gaps are called out, expired deadlines are caught, and weak fits are marked as weak.",
  },
  {
    icon: FileText,
    title: "Drafts the paperwork",
    body: "For the roles worth your time, a tailored resume and a cover-letter draft are waiting — built from your own CV, with gaps flagged rather than papered over.",
  },
  {
    icon: Hand,
    title: "You press apply",
    body: "Candor prefills the form and stops. Nothing is ever submitted on your behalf — the last click is always yours.",
  },
] as const;

const STEPS = [
  { n: "01", title: "Add your CV", body: "Your experience is the source of truth for every score and every draft." },
  { n: "02", title: "Wake up to a shortlist", body: "A daily scan and triage turns thousands of postings into the few worth reading." },
  { n: "03", title: "Review and apply", body: "Open a role, read the verdict, check the drafts, and send it yourself." },
] as const;

export default function WelcomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/welcome" className="flex items-center gap-2.5" aria-label={`${BRAND.name} home`}>
          <CandorMark size={30} />
          <span className={`${instrumentSerif.className} text-2xl tracking-tight text-landing`}>{BRAND.name}</span>
        </Link>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Link
            href="/dashboard-login"
            className="inline-flex items-center rounded-full border border-border bg-surface/60 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover max-sm:min-h-[44px]"
          >
            Sign in
          </Link>
        </div>
      </header>

      <section className="dot-bg relative">
        <HeroGlow />
        <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] bg-background/55 backdrop-blur-[2px]" />
        <div className="relative z-10 mx-auto max-w-5xl px-6 pb-24 pt-16 text-center md:pb-32 md:pt-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            <Sparkles className="size-3 text-brand" /> job search, without the noise
          </p>
          <h1 className={`${instrumentSerif.className} mx-auto mt-6 max-w-3xl text-5xl leading-[1.05] text-landing md:text-7xl`}>
            Your job search, <span className="text-brand">clearly.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted md:text-lg">{BRAND.description}</p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/dashboard-login"
              className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-medium text-brand-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-200 hover:shadow-md max-sm:min-h-[44px]"
            >
              Open your dashboard <ArrowRight className="size-4" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center rounded-full border border-border bg-surface/60 px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover max-sm:min-h-[44px]"
            >
              How it works
            </a>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-5xl px-6 py-16 md:py-24">
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <Card key={title} corner="br" className="p-6">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-text">
                <Icon className="size-5" />
              </span>
              <h2 className={`${instrumentSerif.className} mt-4 text-2xl text-landing`}>{title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="relative z-10 mx-auto max-w-5xl scroll-mt-8 px-6 pb-16 md:pb-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
          <span className="text-faint">//</span> how it works
        </p>
        <h2 className={`${instrumentSerif.className} mt-2 text-4xl text-landing md:text-5xl`}>Three steps, then it runs itself.</h2>
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {STEPS.map(({ n, title, body }) => (
            <li key={n} className="border-t border-border pt-5">
              <span className="font-mono text-sm text-brand-text">{n}</span>
              <h3 className="mt-2 text-lg font-medium text-foreground">{title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-20">
        <Card corner="tl" elevated className="flex flex-col items-start gap-5 p-8 md:flex-row md:items-center md:justify-between md:p-10">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-text">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h2 className={`${instrumentSerif.className} text-3xl text-landing`}>Honest by design.</h2>
              <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-muted">
                A tool that flatters you wastes your time. Candor tells you when a role isn&apos;t a fit, when the
                posting looks stale, and when your CV doesn&apos;t back up a requirement — so you spend effort where
                it counts.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard-login"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-200 max-sm:min-h-[44px]"
          >
            Sign in <ArrowRight className="size-4" />
          </Link>
        </Card>
      </section>

      <footer className="relative z-10 border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-faint">
          <span>
            © {new Date().getFullYear()} {BRAND.name}
          </span>
          <span>{BRAND.lineage} · MIT</span>
        </div>
      </footer>
    </div>
  );
}
