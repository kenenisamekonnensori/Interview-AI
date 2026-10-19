"use client";

import { useEffect, useState } from "react";

import { readSessionFlag, writeSessionFlag } from "@/features/nudges/lib/nudge-dismissal";
import { ProfileSetupCard } from "@/features/profile/components/profile-setup-card";
import { useProfileNudgeState } from "@/features/profile/lib/use-profile-nudge";
import { ResumeSetupCard } from "@/features/resumes/components/resume-setup-card";
import { useResumeNudgeState } from "@/features/resumes/lib/use-resume-nudge";

/**
 * Session flag: after a dismissal, no further setup nudge is promoted until
 * the next visit. Without this, dismissing the profile card would immediately
 * promote the resume card — a dismissal should feel like a decision that is
 * respected, not a queue advancing.
 */
const SETUP_NUDGES_SNOOZE_KEY = "interviewer-ai:setup-nudges:snoozed-visit";

/**
 * Dashboard orchestrator for setup nudges.
 *
 * Rules:
 * - At most ONE card is visible at a time; profile setup outranks resume
 *   setup because it also personalizes the dashboard itself.
 * - Each card's own dismissal persistence lives in its lib module
 *   (localStorage, 14-day window, context-keyed). The orchestrator adds the
 *   visit-level snooze on top.
 * - The orchestrator's dismissal (X, Escape, "Maybe later") applies the
 *   per-nudge persistence AND sets the session flag, so the next card is not
 *   promoted mid-visit.
 * - Non-blocking: the card appears below the active-interview and
 *   preparation sections, never above the primary CTA.
 * - Safe on SSR: storage is read after mount, so server and first client
 *   render agree on "hidden".
 */
export function SetupNudges() {
  const profile = useProfileNudgeState();
  const resume = useResumeNudgeState();

  const [snoozed, setSnoozed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSnoozed(readSessionFlag(window.sessionStorage, SETUP_NUDGES_SNOOZE_KEY));
    setReady(true);
  }, []);

  const profileVisible = ready && profile.ready && profile.visible && !snoozed;
  const resumeVisible = ready && resume.ready && resume.visible && !snoozed && !profileVisible;

  const dismissProfile = () => {
    profile.dismiss();
    writeSessionFlag(window.sessionStorage, SETUP_NUDGES_SNOOZE_KEY);
    setSnoozed(true);
  };

  const dismissResume = () => {
    resume.dismiss();
    writeSessionFlag(window.sessionStorage, SETUP_NUDGES_SNOOZE_KEY);
    setSnoozed(true);
  };

  if (profileVisible && profile.profile && profile.score) {
    return (
      <ProfileSetupCard
        missing={profile.missing}
        score={profile.score}
        fields={profile.fields}
        onDismiss={dismissProfile}
      />
    );
  }

  if (resumeVisible && resume.state !== "ready") {
    return <ResumeSetupCard state={resume.state} onDismiss={dismissResume} />;
  }

  return null;
}
