import { describe, expect, it } from "vitest";

import {
  isNudgeDismissalExpired,
  isFiniteTimestamp,
  readSessionFlag,
  readStoredNudge,
  writeSessionFlag,
  writeStoredNudge,
  clearStoredNudge,
} from "@/features/nudges/lib/nudge-dismissal";

const DAY = 24 * 60 * 60 * 1000;

function storageStub(): { storage: Storage; values: Map<string, string>; fail: boolean } {
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

describe("isNudgeDismissalExpired", () => {
  const now = 1_700_000_000_000;

  it("is not expired before the window ends", () => {
    expect(isNudgeDismissalExpired(now - 14 * DAY + 1, now, 14)).toBe(false);
  });

  it("expires at exactly the boundary", () => {
    expect(isNudgeDismissalExpired(now - 14 * DAY, now, 14)).toBe(true);
  });

  it("handles other windows", () => {
    expect(isNudgeDismissalExpired(now - 7 * DAY, now, 7)).toBe(true);
    expect(isNudgeDismissalExpired(now - 6 * DAY, now, 7)).toBe(false);
  });
});

describe("isFiniteTimestamp", () => {
  it("accepts finite epoch milliseconds", () => {
    expect(isFiniteTimestamp(0)).toBe(true);
    expect(isFiniteTimestamp(1_700_000_000_000)).toBe(true);
  });

  it("rejects non-finite and non-number values", () => {
    expect(isFiniteTimestamp(Number.NaN)).toBe(false);
    expect(isFiniteTimestamp(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFiniteTimestamp("123")).toBe(false);
    expect(isFiniteTimestamp(null)).toBe(false);
    expect(isFiniteTimestamp(undefined)).toBe(false);
  });
});

type TestDismissal = { key: string; dismissedAt: number };

function isTestDismissal(value: unknown): value is TestDismissal {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as TestDismissal).key === "string" &&
    isFiniteTimestamp((value as TestDismissal).dismissedAt)
  );
}

describe("stored-nudge persistence", () => {
  it("round-trips a dismissal", () => {
    const { storage } = storageStub();
    const dismissal = { key: "a+b", dismissedAt: 123 };
    writeStoredNudge(storage, "test:key", dismissal);
    expect(readStoredNudge(storage, "test:key", isTestDismissal)).toEqual(dismissal);
  });

  it("returns null for malformed JSON", () => {
    const { storage, values } = storageStub();
    values.set("test:key", "{not json");
    expect(readStoredNudge(storage, "test:key", isTestDismissal)).toBeNull();
  });

  it("returns null for structurally wrong payloads", () => {
    const { storage, values } = storageStub();
    values.set("test:key", JSON.stringify({ key: 42, dismissedAt: "x" }));
    expect(readStoredNudge(storage, "test:key", isTestDismissal)).toBeNull();
  });

  it("treats storage as unavailable when null/undefined", () => {
    expect(readStoredNudge(null, "test:key", isTestDismissal)).toBeNull();
    expect(readStoredNudge(undefined, "test:key", isTestDismissal)).toBeNull();
    expect(() => writeStoredNudge(null, "test:key", { key: "a", dismissedAt: 1 })).not.toThrow();
    expect(() => clearStoredNudge(null, "test:key")).not.toThrow();
  });

  it("swallows write failures (private mode / quota)", () => {
    const { storage } = storageStub();
    storage.fail = true;
    expect(() => writeStoredNudge(storage, "test:key", { key: "a", dismissedAt: 1 })).not.toThrow();
    expect(readStoredNudge(storage, "test:key", isTestDismissal)).toBeNull();
  });

  it("clear removes stored state", () => {
    const { storage } = storageStub();
    writeStoredNudge(storage, "test:key", { key: "a", dismissedAt: 1 });
    clearStoredNudge(storage, "test:key");
    expect(readStoredNudge(storage, "test:key", isTestDismissal)).toBeNull();
  });
});

describe("session flags", () => {
  it("round-trips", () => {
    const { storage } = storageStub();
    expect(readSessionFlag(storage, "flag")).toBe(false);
    writeSessionFlag(storage, "flag");
    expect(readSessionFlag(storage, "flag")).toBe(true);
  });

  it("treats any other value as unset", () => {
    const { storage, values } = storageStub();
    values.set("flag", "0");
    expect(readSessionFlag(storage, "flag")).toBe(false);
  });

  it("tolerates unavailable storage", () => {
    expect(readSessionFlag(null, "flag")).toBe(false);
    expect(() => writeSessionFlag(null, "flag")).not.toThrow();
  });

  it("swallows write failures", () => {
    const { storage } = storageStub();
    storage.fail = true;
    expect(() => writeSessionFlag(storage, "flag")).not.toThrow();
  });
});
