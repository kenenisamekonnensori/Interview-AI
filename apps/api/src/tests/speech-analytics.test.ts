import { describe, expect, it } from "vitest";
import {
  calculateSpeechDeliveryMetrics,
  type TurnTimingInput,
} from "../modules/reports/speech-analytics.js";

describe("Speech Analytics Calculation Accuracy (Acceptance Check 1)", () => {
  it("computes accurate WPM and filler word metrics from turn input", () => {
    // Construct a 180-word text containing exactly 14 "like", 4 "um", 2 "basically"
    // Total fillers = 20. Non-filler words needed = 160 words.
    const fillers = [
      ...Array(14).fill("like"),
      ...Array(4).fill("um"),
      ...Array(2).fill("basically"),
    ];
    const normalWords = Array(160).fill("word");
    const combinedTokens: string[] = [];

    // Interleave tokens to form a realistic response
    let fillerIdx = 0;
    let normalIdx = 0;
    while (fillerIdx < fillers.length || normalIdx < normalWords.length) {
      if (normalIdx < normalWords.length) {
        combinedTokens.push(normalWords[normalIdx++]);
      }
      if (normalIdx % 8 === 0 && fillerIdx < fillers.length) {
        combinedTokens.push(fillers[fillerIdx++]);
      }
    }
    while (fillerIdx < fillers.length) {
      combinedTokens.push(fillers[fillerIdx++]);
    }

    expect(combinedTokens.length).toBe(180);
    const text = combinedTokens.join(" ");

    const turn: TurnTimingInput = {
      id: "turn-1",
      speaker: "USER",
      text,
      createdAt: new Date("2026-11-03T10:00:00Z"),
      startedAt: new Date("2026-11-03T10:00:00Z"),
      endedAt: new Date("2026-11-03T10:01:00Z"),
      durationMs: 60_000,
      words: null,
    };

    const metrics = calculateSpeechDeliveryMetrics({ turns: [turn] });

    expect(metrics.overallWpm).toBe(180);
    expect(metrics.totalFillerWords).toBe(20);
    expect(metrics.fillerWordCounts.like).toBe(14);
    expect(metrics.fillerWordCounts.um).toBe(4);
    expect(metrics.fillerWordCounts.basically).toBe(2);
    expect(metrics.turnWpm).toEqual([{ turnId: "turn-1", wpm: 180 }]);
  });
});
