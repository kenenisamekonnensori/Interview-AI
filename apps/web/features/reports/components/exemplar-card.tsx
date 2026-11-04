import type { QuestionExemplar } from "@interviewer-ai/types";
import { Award, Lightbulb, MessageSquareQuote, Sparkles } from "lucide-react";

export function ExemplarComparisonCard({
  exemplars,
}: {
  exemplars?: QuestionExemplar[] | null | undefined;
}) {
  // Only render for questions scoring under 70%
  const qualifyingExemplars = (exemplars ?? []).filter((e) => e.candidateScore < 70);

  if (qualifyingExemplars.length === 0) {
    return null;
  }

  return (
    <section className="space-y-6" data-testid="exemplar-card">
      <div className="flex items-center gap-2">
        <Sparkles className="size-5 text-primary" />
        <h2 className="text-xl font-semibold">Staff-level exemplar coaching</h2>
      </div>
      <p className="-mt-3 text-sm text-muted-foreground">
        Targeted exemplar reconstructions demonstrating active ownership, quantifiable metrics, and
        structured STAR delivery for answers scoring below 70%.
      </p>

      {qualifyingExemplars.map((exemplar, index) => (
        <article
          key={exemplar.turnId || index}
          className="rounded-3xl border border-white/[.08] bg-card/45 p-5 sm:p-6"
        >
          {/* Question Header & Score Pill */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-4">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <p className="font-medium text-foreground">{exemplar.questionText}</p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
              Score: {exemplar.candidateScore}/100 — Needs Improvement
            </div>
          </div>

          {/* Side-by-side on desktop (lg:grid-cols-2), stacked on mobile (grid-cols-1) */}
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Left: What You Said */}
            <div className="flex flex-col justify-between rounded-2xl border border-white/[.06] bg-background/40 p-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[.12em] text-muted-foreground">
                  <MessageSquareQuote className="size-4" />
                  What you said
                </div>
                <blockquote className="mt-3 text-sm italic leading-relaxed text-muted-foreground/90">
                  &ldquo;{exemplar.candidateAnswerSnippet}&rdquo;
                </blockquote>
              </div>
              <div className="mt-4 rounded-xl border border-white/5 bg-white/[.03] p-3 text-xs text-muted-foreground">
                <span className="font-medium text-amber-400">Feedback: </span>
                Diffuse ownership or missing quantifiable results.
              </div>
            </div>

            {/* Right: Staff-Level Exemplar Response */}
            <div className="flex flex-col justify-between rounded-2xl border border-primary/25 bg-primary/5 p-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.12em] text-primary">
                  <Award className="size-4" />
                  Staff-level exemplar response
                </div>
                <p className="mt-3 text-sm leading-relaxed text-foreground">
                  {exemplar.exemplarResponse}
                </p>
              </div>

              {/* Improvement Rationale */}
              <div className="mt-4 rounded-xl border border-primary/20 bg-primary/10 p-3 text-xs leading-relaxed text-muted-foreground">
                <div className="flex items-center gap-1.5 font-semibold text-primary">
                  <Lightbulb className="size-3.5" />
                  Why this response scores higher
                </div>
                <p className="mt-1 text-foreground/90">{exemplar.improvementRationale}</p>
              </div>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
