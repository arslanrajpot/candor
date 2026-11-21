import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RoleScore — fit-score any job with your own AI key",
  description: "Paste your resume once, bring your own AI key, and get an honest fit score for any job description.",
};

export default function RoleScoreLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[var(--bg)] text-zinc-900 dark:text-zinc-100">{children}</div>;
}
