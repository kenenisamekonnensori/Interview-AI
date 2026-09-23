"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import {
  clearResumeNudgeDismissal,
  readResumeNudgeDismissal,
  resumeSetupState,
  shouldShowResumeNudge,
  writeResumeNudgeDismissal,
  type ResumeNudgeDismissal,
  type ResumeSignal,
} from "@/features/resumes/lib/resume-setup";

type ResumesResponse = { resumes: ResumeSignal };

/**
 * All state for the resume-setup nudge: the shared ["resumes"] query cache
 * (also used by interview creation and profile overview, so no extra network
 * request), the dismissal record, and the re-show policy. Kept separate from
 * the presentational card so the dashboard orchestrator can compute
 * visibility without rendering the card.
 */
export function useResumeNudgeState() {
  const resumes = useQuery({
    queryKey: ["resumes"],
    queryFn: () => apiClient<ResumesResponse>("/api/v1/resumes"),
  });

  // Storage is read after mount: SSR and the first client render agree on
  // "hidden", so a dismissed card never flashes on hydration.
  const [dismissal, setDismissal] = useState<ResumeNudgeDismissal | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDismissal(readResumeNudgeDismissal(window.localStorage));
    setReady(true);
  }, []);

  const list = resumes.data?.resumes;
  const state = resumeSetupState(list);

  const visible =
    ready &&
    list !== undefined &&
    shouldShowResumeNudge({ resumes: list, dismissal, now: Date.now() });

  const dismiss = useCallback(() => {
    if (state === "ready") return;
    const next: ResumeNudgeDismissal = { state, dismissedAt: Date.now() };
    writeResumeNudgeDismissal(window.localStorage, next);
    setDismissal(next);
  }, [state]);

  // Tidy stored state once there is nothing left to remind about.
  useEffect(() => {
    if (list && state === "ready") clearResumeNudgeDismissal(window.localStorage);
  }, [list, state]);

  return {
    /** The resume list once loaded; null while loading or on failure. */
    resumes: list ?? null,
    state,
    visible,
    /** True once storage has been read and the query has succeeded. */
    ready: ready && resumes.isSuccess,
    dismiss,
  };
}
