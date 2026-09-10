import assert from "node:assert/strict";
import { test } from "vitest";

import type { ReadinessGap } from "@interviewer-ai/types";
import { changeLabel, groupGaps, nextAction, scoreTone } from "./readiness-helpers.js";

const gap = (label: string, kind: ReadinessGap["kind"]): ReadinessGap => ({
  skillKey: null,
  label,
  kind,
  detail: "detail",
});

test("score tone buckets are deterministic and handle the empty state", () => {
  assert.equal(scoreTone(null), "none");
  assert.equal(scoreTone(49), "low");
  assert.equal(scoreTone(50), "medium");
  assert.equal(scoreTone(74), "medium");
  assert.equal(scoreTone(75), "high");
});

test("change label formats trends and hides an absent trend", () => {
  assert.equal(changeLabel(null), null);
  assert.equal(changeLabel(0), "No change");
  assert.equal(changeLabel(6), "+6 pts");
  assert.equal(changeLabel(-4), "−4 pts");
});

test("next action prefers missing evidence and falls back to the weakest gap", () => {
  const behavioral = gap("Behavioral", "WEAK_SKILL");
  const gaps = [behavioral, gap("Kubernetes", "MISSING_EVIDENCE")];
  assert.equal(nextAction(gaps), "Kubernetes");
  assert.equal(nextAction([behavioral]), "Behavioral");
  assert.equal(nextAction([]), null);
});

test("group gaps split weak skills from missing evidence", () => {
  const grouped = groupGaps([gap("A", "WEAK_SKILL"), gap("B", "MISSING_EVIDENCE")]);
  assert.deepEqual(
    grouped.weak.map((entry) => entry.label),
    ["A"],
  );
  assert.deepEqual(
    grouped.missing.map((entry) => entry.label),
    ["B"],
  );
});
