"use client";

import type {
  ProfileNudgeDismissal,
  ProfileSnapshot,
} from "@/features/profile/lib/profile-completeness";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  PROFILE_COMPLETENESS_FIELDS,
  clearProfileNudgeDismissal,
  missingProfileFields,
  profileCompletenessScore,
  profileNudgeKey,
  readProfileNudgeDismissal,
  shouldShowProfileNudge,
  writeProfileNudgeDismissal,
} from "@/features/profile/lib/profile-completeness";
import { apiClient } from "@/lib/api-client";

type ProfileResponse = { profile: ProfileSnapshot };

/**
 * All state for the profile-setup nudge: the shared ["profile"] query cache
 * (no extra network request), the dismissal record, and the re-show policy.
 * Kept separate from the presentational card so the dashboard orchestrator
 * can compute visibility without rendering the card.
 */
export function useProfileNudgeState() {
  // Shares the AppShell ["profile"] query cache — no extra network request.
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiClient<ProfileResponse>("/api/v1/profile"),
  });

  // Storage is read after mount: SSR and the first client render agree on
  // "hidden", so a dismissed card never flashes on hydration.
  const [dismissal, setDismissal] = useState<ProfileNudgeDismissal | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDismissal(readProfileNudgeDismissal(window.localStorage));
    setReady(true);
  }, []);

  const value = profile.data?.profile;
  const missing = value ? missingProfileFields(value) : [];

  const visible =
    ready && value !== undefined && shouldShowProfileNudge({ missing, dismissal, now: Date.now() });

  const dismiss = useCallback(() => {
    if (missing.length === 0) return;
    const next: ProfileNudgeDismissal = {
      key: profileNudgeKey(missing),
      dismissedAt: Date.now(),
    };
    writeProfileNudgeDismissal(window.localStorage, next);
    setDismissal(next);
  }, [missing]);

  // Tidy stored state once there is nothing left to remind about.
  useEffect(() => {
    if (value && missing.length === 0) clearProfileNudgeDismissal(window.localStorage);
  }, [value, missing.length]);

  return {
    /** Undefined until the profile query resolves; null when loading failed. */
    profile: value ?? null,
    missing,
    score: value ? profileCompletenessScore(value) : null,
    fields: PROFILE_COMPLETENESS_FIELDS,
    visible,
    /** True once storage has been read and the query has settled enough. */
    ready: ready && profile.isSuccess,
    dismiss,
  };
}
