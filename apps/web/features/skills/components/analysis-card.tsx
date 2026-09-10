"use client";

import type { SkillAnalysisDto } from "@interviewer-ai/types";
import { Sparkles } from "lucide-react";

export function AnalysisCard({
  analysis,
  validReportCount,
}: {
  analysis: SkillAnalysisDto | null;
  validReportCount: number;
}) {
  if (!analysis) {
    return (
      <section className="surface p-5">
        <p className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden="true" /> AI interpretation
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {validReportCount < 2
            ? "Complete at least two scored interviews and an AI summary of your strengths and weaknesses will appear here. Your skill assessments below are always computed from your real evaluations."
            : "Your AI interpretation will be refreshed automatically after your next completed interview. The assessments below are already up to date."}
        </p>
      </section>
    );
  }
  if (analysis.status === "GENERATING") {
    return (
      <section className="surface p-5">
        <p className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden="true" /> AI interpretation
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your skill analysis is being updated and will appear here shortly.
        </p>
      </section>
    );
  }
  if (analysis.status === "FAILED" || !analysis.summary) {
    return (
      <section className="surface p-5">
        <p className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden="true" /> AI interpretation
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The AI interpretation is temporarily unavailable. Your assessments below are always up to
          date.
        </p>
      </section>
    );
  }
  return (
    <section className="surface p-5">
      <p className="flex items-center gap-2 font-semibold">
        <Sparkles className="size-4 text-primary" aria-hidden="true" /> AI interpretation
      </p>
      <p className="mt-2 max-w-3xl text-sm leading-6">{analysis.summary}</p>
      <p className="mt-3 text-xs text-muted-foreground">
        AI-generated · based on {analysis.basedOnObservationCount}{" "}
        {analysis.basedOnObservationCount === 1 ? "observation" : "observations"} across{" "}
        {analysis.basedOnInterviewIds.length}{" "}
        {analysis.basedOnInterviewIds.length === 1 ? "interview" : "interviews"}
        {analysis.model ? ` · ${analysis.model}` : ""}
        {analysis.generatedAt ? ` · ${formatDate(analysis.generatedAt)}` : ""}
      </p>
    </section>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
