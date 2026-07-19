import { BarChart3, Mic, Sparkles } from "lucide-react";
import type { PropsWithChildren } from "react";

export function AuthShell({ children }: PropsWithChildren) {
  return (
    <main className="relative grid min-h-screen overflow-hidden lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden border-r border-border bg-[radial-gradient(circle_at_15%_20%,oklch(0.36_0.1_250_/_32%),transparent_32%),radial-gradient(circle_at_80%_65%,oklch(0.42_0.12_180_/_18%),transparent_34%)] p-10 lg:flex lg:flex-col">
        <div className="flex items-center gap-3 text-sm font-semibold tracking-tight">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <Mic className="size-5" aria-hidden="true" />
          </span>
          Interviewer AI
        </div>

        <div className="my-auto max-w-xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Practice with real momentum
          </div>
          <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-[-0.04em] text-foreground">
            Build confidence before the conversation counts.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">
            Rehearse high-stakes interviews with an AI interviewer that listens, adapts, and gives you useful feedback.
          </p>
        </div>

        <div className="relative rounded-2xl border border-border bg-card/60 p-5 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Interview readiness</p>
              <p className="mt-1 text-xs text-muted-foreground">Your practice improves over time.</p>
            </div>
            <BarChart3 className="size-5 text-primary" aria-hidden="true" />
          </div>
          <div className="flex h-16 items-end gap-2" aria-hidden="true">
            {[35, 47, 42, 64, 58, 82, 76, 94].map((height, index) => (
              <span key={index} className="flex-1 rounded-t bg-primary/80" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center p-5 sm:p-8">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Mic className="size-5" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Interviewer AI</span>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
