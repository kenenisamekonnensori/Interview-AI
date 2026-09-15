import { describe, expect, it } from "vitest";

import {
  PROFILE_COMPLETENESS_FIELDS,
  PROFILE_NUDGE_RESHOW_DAYS,
  clearProfileNudgeDismissal,
  isDismissalExpired,
  missingProfileFields,
  profileCompletenessScore,
  profileNudgeKey,
  readProfileNudgeDismissal,
  shouldShowProfileNudge,
  writeProfileNudgeDismissal,
} from "@/features/profile/lib/profile-completeness";

const complete: ProfileSnapshotLike = {
  preferredName: "Keneni",
  profession: "Software Engineer",
  targetRole: "Backend Engineer",
  seniority: "Mid-level",
  yearsOfExperience: 4,
};

type ProfileSnapshotLike = {
  preferredName: string | null;
  profession: string | null;
  targetRole: string | null;
  seniority: string | null;
  yearsOfExperience: number | null;
};

const DAY = 24 * 60 * 60 * 1000;

function storageStub(): {
  storage: Storage;
  values: Map<string, string>;
  fail: boolean;
} {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => (values.has(key) ? values.get(key)! : null),
    setItem: (key: string, value: string) => {
      if (storage.fail) throw new Error("quota");
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => values.clear(),
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
  } as unknown as Storage;
  return { storage, values, fail: false };
}

describe("missingProfileFields", () => {
  it("reports nothing missing for a complete profile", () => {
    expect(missingProfileFields(complete)).toEqual([]);
  });

  it("reports every field missing for a brand-new user", () => {
    const empty: ProfileSnapshotLike = {
      preferredName: null,
      profession: null,
      targetRole: null,
      seniority: null,
      yearsOfExperience: null,
    };
    const missing = missingProfileFields(empty);
    expect(missing.map((field) => field.key)).toEqual(
      PROFILE_COMPLETENESS_FIELDS.map((field) => field.key),
    );
  });

  it("treats whitespace-only strings as missing", () => {
    const messy: ProfileSnapshotLike = { ...complete, targetRole: "   " };
    expect(missingProfileFields(messy).map((field) => field.key)).toEqual(["targetRole"]);
  });

  it("treats zero years of experience as a real value", () => {
    const junior: ProfileSnapshotLike = { ...complete, yearsOfExperience: 0 };
    expect(missingProfileFields(junior)).toEqual([]);
  });
});

describe("profileCompletenessScore", () => {
  it("counts filled fields and rounds the percent", () => {
    const partial: ProfileSnapshotLike = { ...complete, targetRole: null, seniority: null };
    const score = profileCompletenessScore(partial);
    expect(score.filled).toBe(3);
    expect(score.total).toBe(5);
    expect(score.percent).toBe(60);
  });
});

describe("profileNudgeKey", () => {
  it("is order-independent for the same field set", () => {
    const a = missingProfileFields({ ...complete, targetRole: null, preferredName: null });
    const b = missingProfileFields({ ...complete, preferredName: null, targetRole: null });
    expect(profileNudgeKey(a)).toBe(profileNudgeKey(b));
  });

  it("changes when the missing set changes", () => {
    const a = missingProfileFields({ ...complete, targetRole: null });
    const b = missingProfileFields({ ...complete, targetRole: null, seniority: null });
    expect(profileNudgeKey(a)).not.toBe(profileNudgeKey(b));
  });
});

describe("shouldShowProfileNudge", () => {
  const missing = missingProfileFields({ ...complete, targetRole: null });
  const now = 1_700_000_000_000;

  it("never shows when the profile is complete", () => {
    expect(
      shouldShowProfileNudge({
        missing: [],
        dismissal: { key: "targetRole", dismissedAt: now },
        now,
      }),
    ).toBe(false);
  });

  it("shows for a new user with no dismissal", () => {
    expect(shouldShowProfileNudge({ missing, dismissal: null, now })).toBe(true);
  });

  it("stays hidden within the reshow window for the same missing set", () => {
    const dismissal = { key: profileNudgeKey(missing), dismissedAt: now - 5 * DAY };
    expect(shouldShowProfileNudge({ missing, dismissal, now })).toBe(false);
  });

  it("re-surfaces after the reshow window passes", () => {
    const dismissal = {
      key: profileNudgeKey(missing),
      dismissedAt: now - (PROFILE_NUDGE_RESHOW_DAYS + 1) * DAY,
    };
    expect(shouldShowProfileNudge({ missing, dismissal, now })).toBe(true);
  });

  it("shows immediately when the missing set changes after dismissal", () => {
    const old = missingProfileFields({ ...complete, targetRole: null });
    const current = missingProfileFields({ ...complete, targetRole: null, seniority: null });
    const dismissal = { key: profileNudgeKey(old), dismissedAt: now - 1 * DAY };
    expect(shouldShowProfileNudge({ missing: current, dismissal, now })).toBe(true);
  });
});

describe("isDismissalExpired", () => {
  const now0 = 1_700_000_000_000;

  it("is not expired just before the window ends", () => {
    const dismissal = { key: "targetRole", dismissedAt: now0 - 14 * DAY + 1 };
    expect(isDismissalExpired(dismissal, now0)).toBe(false);
  });

  it("expires at exactly the window boundary", () => {
    const dismissal = { key: "targetRole", dismissedAt: now0 - 14 * DAY };
    expect(isDismissalExpired(dismissal, now0)).toBe(true);
  });
});

describe("dismissal storage", () => {
  it("round-trips a dismissal", () => {
    const { storage } = storageStub();
    const dismissal = { key: "targetRole", dismissedAt: 123 };
    writeProfileNudgeDismissal(storage, dismissal);
    expect(readProfileNudgeDismissal(storage)).toEqual(dismissal);
  });

  it("returns null for malformed JSON", () => {
    const { storage, values } = storageStub();
    values.set("interviewer-ai:profile-nudge:v1", "{not json");
    expect(readProfileNudgeDismissal(storage)).toBeNull();
  });

  it("returns null for structurally wrong payloads", () => {
    const { storage, values } = storageStub();
    values.set("interviewer-ai:profile-nudge:v1", JSON.stringify({ key: 42, dismissedAt: "x" }));
    expect(readProfileNudgeDismissal(storage)).toBeNull();
  });

  it("returns null when storage is unavailable", () => {
    expect(readProfileNudgeDismissal(null)).toBeNull();
    expect(readProfileNudgeDismissal(undefined)).toBeNull();
  });

  it("swallows write failures (private mode / quota)", () => {
    const { storage } = storageStub();
    storage.fail = true;
    expect(() =>
      writeProfileNudgeDismissal(storage, { key: "targetRole", dismissedAt: 1 }),
    ).not.toThrow();
    expect(readProfileNudgeDismissal(storage)).toBeNull();
  });

  it("clear removes stored state", () => {
    const { storage } = storageStub();
    writeProfileNudgeDismissal(storage, { key: "targetRole", dismissedAt: 1 });
    clearProfileNudgeDismissal(storage);
    expect(readProfileNudgeDismissal(storage)).toBeNull();
  });
});
