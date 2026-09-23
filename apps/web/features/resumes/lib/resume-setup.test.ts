import { describe, expect, it } from "vitest";

import {
  RESUME_NUDGE_RESHOW_DAYS,
  isResumeNudgeDismissal,
  readResumeNudgeDismissal,
  resumeSetupState,
  shouldShowResumeNudge,
  writeResumeNudgeDismissal,
  clearResumeNudgeDismissal,
} from "@/features/resumes/lib/resume-setup";

const DAY = 24 * 60 * 60 * 1000;

describe("resumeSetupState", () => {
  it("is 'none' with no resumes", () => {
    expect(resumeSetupState([])).toBe("none");
    expect(resumeSetupState(undefined)).toBe("none");
  });

  it("is 'ready' when any resume is active", () =>
    expect(resumeSetupState([{ isActive: true, status: "READY" }])).toBe("ready"));

  it("is 'no-active' when resumes exist but none is active", () => {
    expect(resumeSetupState([{ isActive: false, status: "READY" }])).toBe("no-active");
    expect(
      resumeSetupState([
        { isActive: false, status: "READY" },
        { isActive: false, status: "ANALYZED" },
      ]),
    ).toBe("no-active");
  });

  it("ignores analysis status — a usable resume never triggers the nudge", () => {
    expect(resumeSetupState([{ isActive: true, status: "ANALYZING" }])).toBe("ready");
    expect(resumeSetupState([{ isActive: true, status: "ANALYZED" }])).toBe("ready");
  });
});

describe("isResumeNudgeDismissal", () => {
  it("accepts valid dismissals for both states", () => {
    expect(isResumeNudgeDismissal({ state: "none", dismissedAt: 1 })).toBe(true);
    expect(isResumeNudgeDismissal({ state: "no-active", dismissedAt: 1 })).toBe(true);
  });

  it("rejects invalid payloads (the old precedence bug would pass some of these)", () => {
    expect(isResumeNudgeDismissal({ state: "none" })).toBe(false); // no timestamp
    expect(isResumeNudgeDismissal({ state: "no-active", dismissedAt: "x" })).toBe(false);
    expect(isResumeNudgeDismissal({ state: "other", dismissedAt: 1 })).toBe(false);
    expect(isResumeNudgeDismissal("none")).toBe(false);
    expect(isResumeNudgeDismissal(null)).toBe(false);
  });
});

describe("shouldShowResumeNudge", () => {
  const now = 1_700_000_000_000;

  it("never shows when an active resume exists", () => {
    expect(
      shouldShowResumeNudge({
        resumes: [{ isActive: true, status: "READY" }],
        dismissal: { state: "none", dismissedAt: now },
        now,
      }),
    ).toBe(false);
  });

  it("shows for a user with no resumes and no dismissal", () => {
    expect(shouldShowResumeNudge({ resumes: [], dismissal: null, now })).toBe(true);
  });

  it("shows when resumes exist but none is active", () => {
    expect(
      shouldShowResumeNudge({
        resumes: [{ isActive: false, status: "READY" }],
        dismissal: null,
        now,
      }),
    ).toBe(true);
  });

  it("stays hidden within the window for the same state", () => {
    expect(
      shouldShowResumeNudge({
        resumes: [],
        dismissal: { state: "none", dismissedAt: now - 5 * DAY },
        now,
      }),
    ).toBe(false);
  });

  it(`re-surfaces after ${RESUME_NUDGE_RESHOW_DAYS} days for the same state`, () => {
    expect(
      shouldShowResumeNudge({
        resumes: [],
        dismissal: { state: "none", dismissedAt: now - (RESUME_NUDGE_RESHOW_DAYS + 1) * DAY },
        now,
      }),
    ).toBe(true);
  });

  it("shows immediately when the state changes after dismissal", () => {
    expect(
      shouldShowResumeNudge({
        resumes: [{ isActive: false, status: "READY" }],
        dismissal: { state: "none", dismissedAt: now - 1 * DAY },
        now,
      }),
    ).toBe(true);
  });
});

describe("resume dismissal storage", () => {
  it("round-trips a dismissal", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    } as unknown as Storage;

    const dismissal = { state: "none" as const, dismissedAt: 123 };
    writeResumeNudgeDismissal(storage, dismissal);
    expect(readResumeNudgeDismissal(storage)).toEqual(dismissal);
    clearResumeNudgeDismissal(storage);
    expect(readResumeNudgeDismissal(storage)).toBeNull();
  });

  it("tolerates unavailable storage", () => {
    expect(readResumeNudgeDismissal(null)).toBeNull();
    expect(() => writeResumeNudgeDismissal(null, { state: "none", dismissedAt: 1 })).not.toThrow();
    expect(() => clearResumeNudgeDismissal(null)).not.toThrow();
  });
});
