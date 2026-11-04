import { describe, expect, it } from "vitest";
import {
  calculateSpeechDeliveryMetrics,
  type TurnTimingInput,
} from "../modules/reports/speech-analytics.js";

describe("Speech Analytics Edge Cases and Missing Timing (Acceptance Check 2)", () => {
  it("returns overallWpm as null when durationMs is null (edge case a)", () => {
    const turn: TurnTimingInput = {
      id: "turn-null-duration",
      speaker: "USER",
      text: Array(50).fill("word").join(" "),
      createdAt: new Date("2026-11-03T10:00:00Z"),
      startedAt: null,
      endedAt: null,
      durationMs: null,
      words: null,
    };

    const metrics = calculateSpeechDeliveryMetrics({ turns: [turn] });
    expect(metrics.overallWpm).toBeNull();
    expect(metrics.turnWpm).toEqual([{ turnId: "turn-null-duration", wpm: null }]);
  });

  it("returns overallWpm as null when durationMs is 0 (edge case b)", () => {
    const turn: TurnTimingInput = {
      id: "turn-zero-duration",
      speaker: "USER",
      text: Array(50).fill("word").join(" "),
      createdAt: new Date("2026-11-03T10:00:00Z"),
      startedAt: null,
      endedAt: null,
      durationMs: 0,
      words: null,
    };

    const metrics = calculateSpeechDeliveryMetrics({ turns: [turn] });
    expect(metrics.overallWpm).toBeNull();
    expect(metrics.turnWpm).toEqual([{ turnId: "turn-zero-duration", wpm: null }]);
  });

  it("returns overallWpm as 0 when text is empty but duration is valid (edge case c)", () => {
    const turn: TurnTimingInput = {
      id: "turn-silence",
      speaker: "USER",
      text: "",
      createdAt: new Date("2026-11-03T10:00:00Z"),
      startedAt: new Date("2026-11-03T10:00:00Z"),
      endedAt: new Date("2026-11-03T10:00:45Z"),
      durationMs: 45_000,
      words: null,
    };

    const metrics = calculateSpeechDeliveryMetrics({ turns: [turn] });
    expect(metrics.overallWpm).toBe(0);
    expect(metrics.turnWpm).toEqual([{ turnId: "turn-silence", wpm: 0 }]);
  });

  it("returns safe nulls and zeros for empty turns without throwing (edge case d)", () => {
    const metrics = calculateSpeechDeliveryMetrics({ turns: [] });

    expect(metrics).toEqual({
      overallWpm: null,
      turnWpm: [],
      fillerWordCounts: {},
      totalFillerWords: 0,
      talkRatio: {
        candidateDurationMs: 0,
        interviewerDurationMs: 0,
        candidatePercentage: 0,
      },
      averageResponseLatencyMs: null,
    });
  });

  it("verifies duration is strictly never computed from createdAt (edge case e)", () => {
    // Two turns with createdAt spaced 60 seconds apart, but durationMs is null
    const turn1: TurnTimingInput = {
      id: "turn-legacy-1",
      speaker: "USER",
      text: Array(120).fill("legacy").join(" "),
      createdAt: new Date("2026-11-03T10:00:00Z"),
      startedAt: null,
      endedAt: null,
      durationMs: null,
      words: null,
    };

    const turn2: TurnTimingInput = {
      id: "turn-legacy-2",
      speaker: "USER",
      text: Array(120).fill("legacy").join(" "),
      createdAt: new Date("2026-11-03T10:01:00Z"),
      startedAt: null,
      endedAt: null,
      durationMs: null,
      words: null,
    };

    const metrics = calculateSpeechDeliveryMetrics({ turns: [turn1, turn2] });
    // If it derived duration from createdAt, overallWpm would be non-null. It must be null.
    expect(metrics.overallWpm).toBeNull();
    expect(metrics.talkRatio.candidateDurationMs).toBe(0);
  });
});
