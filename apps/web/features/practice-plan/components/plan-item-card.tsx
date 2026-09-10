"use client";

import type { PracticePlanItemDto } from "@interviewer-ai/types";
import {
  BookOpen,
  Check,
  CircleDashed,
  Code2,
  Layers,
  ListChecks,
  MessageSquare,
  Mic2,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";

import {
  activityTypeInfo,
  interviewTypeForActivity,
} from "@/features/practice-plan/lib/plan-helpers";

const activityIcons = {
  MOCK_INTERVIEW: Mic2,
  QUESTION_SET: ListChecks,
  TECHNICAL_TOPIC: BookOpen,
  SYSTEM_DESIGN_EXERCISE: Layers,
  CODING_EXERCISE: Code2,
  COMMUNICATION_EXERCISE: MessageSquare,
} as const;

export function PlanItemCard({
  item,
  onToggle,
  pending,
}: {
  item: PracticePlanItemDto;
  onToggle: () => void;
  pending: boolean;
}) {
  const Icon = activityIcons[item.activityType];
  const typeInfo = activityTypeInfo[item.activityType];
  const completed = item.status === "COMPLETED";
  return (
    <div className={`surface p-5 ${completed ? "opacity-80" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`flex size-8 items-center justify-center rounded-lg ${
                completed ? "bg-emerald-300/15 text-emerald-300" : "bg-primary/15 text-primary"
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <p className={`font-medium ${completed ? "line-through" : ""}`}>{item.title}</p>
            <PriorityChip priority={item.priority} />
            <span className="text-xs text-muted-foreground">
              {typeInfo.label} · {item.estimatedMinutes} min
            </span>
          </div>
          {item.description ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
          ) : null}
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            <span className="font-medium text-foreground">Why:</span> {item.rationale}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!completed ? (
            <Link
              href={`/interviews/new?type=${interviewTypeForActivity(item.activityType)}`}
              className="button-primary inline-flex h-9 items-center gap-1.5 px-3 text-sm"
            >
              <Mic2 className="size-4" /> Start
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            disabled={pending}
            className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors disabled:opacity-60 ${
              completed
                ? "border-border text-muted-foreground hover:text-foreground"
                : "border-emerald-300/30 bg-emerald-300/10 text-emerald-300 hover:bg-emerald-300/15"
            }`}
          >
            {completed ? <RotateCcw className="size-4" /> : <Check className="size-4" />}
            {completed ? "Undo" : "Done"}
          </button>
        </div>
      </div>
      {item.status === "PENDING" ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CircleDashed className="size-3.5" aria-hidden="true" /> Recommended next if nothing else
          is pending above.
        </p>
      ) : null}
    </div>
  );
}

function PriorityChip({ priority }: { priority: PracticePlanItemDto["priority"] }) {
  if (priority === "HIGH")
    return (
      <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
        High priority
      </span>
    );
  if (priority === "LOW")
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        Low priority
      </span>
    );
  return null;
}
