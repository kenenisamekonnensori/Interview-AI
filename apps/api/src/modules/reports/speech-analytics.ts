export type WordTimingEntry = {
  word: string;
  start: number;
  end: number;
  confidence?: number;
};

export type TurnTimingInput = {
  id: string;
  speaker: "USER" | "AI" | "SYSTEM";
  text: string;
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  durationMs: number | null;
  words: WordTimingEntry[] | null;
};

export type SpeechAnalyticsInput = {
  turns: TurnTimingInput[];
};

export type SpeechDeliveryMetrics = {
  overallWpm: number | null;
  turnWpm: Array<{ turnId: string; wpm: number | null }>;
  fillerWordCounts: Record<string, number>;
  totalFillerWords: number;
  talkRatio: {
    candidateDurationMs: number;
    interviewerDurationMs: number;
    candidatePercentage: number;
  };
  averageResponseLatencyMs: number | null;
};

const FILLER_WORD_REGEX = /\b(um|uh|like|you know|sort of|kind of|basically|actually)\b/gi;

/**
 * Thresholds to prevent conversational interjections ("yeah", "okay")
 * or micro-pauses from skewing the candidate's speaking pace gauge.
 */
export const MIN_CANDIDATE_TURN_WORDS_FOR_PACE = 3;
export const MIN_CANDIDATE_TURN_DURATION_MS_FOR_PACE = 2_000;

function countWords(turn: TurnTimingInput): number {
  if (turn.words && turn.words.length > 0) {
    return turn.words.length;
  }
  const trimmed = turn.text.trim();
  if (trimmed === "") {
    return 0;
  }
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function calculateSpeechDeliveryMetrics(
  input: SpeechAnalyticsInput,
): SpeechDeliveryMetrics {
  const turns = input.turns;

  if (!turns || turns.length === 0) {
    return {
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
    };
  }

  // 1. Turn WPM (candidate/USER turns only)
  const turnWpm: Array<{ turnId: string; wpm: number | null }> = [];
  let qualifyingCandidateWords = 0;
  let qualifyingCandidateDurationMs = 0;
  let hasEligibleCandidateTurn = false;

  // 2. Filler words (across all candidate/USER turns)
  const fillerWordCounts: Record<string, number> = {};
  let totalFillerWords = 0;

  // 3. Talk-to-listen ratio
  let candidateDurationMs = 0;
  let interviewerDurationMs = 0;

  // 4. Response latency (candidate turns immediately preceded by AI turns)
  const pauses: number[] = [];

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (!turn) continue;

    const isCandidate = turn.speaker === "USER";
    const isInterviewer = turn.speaker === "AI";
    const duration = turn.durationMs;

    if (isCandidate) {
      const wordsCount = countWords(turn);

      // Turn WPM
      if (duration == null || duration <= 0) {
        turnWpm.push({ turnId: turn.id, wpm: null });
      } else if (wordsCount === 0) {
        turnWpm.push({ turnId: turn.id, wpm: 0 });
      } else {
        const wpm = Math.round((wordsCount * 60_000) / duration);
        turnWpm.push({ turnId: turn.id, wpm });
      }

      // Overall WPM accumulator
      if (duration != null && duration > 0) {
        // Include turn if it meets the minimum pacing criteria OR if word count is 0 and duration is >= 2s
        const meetsThreshold =
          (wordsCount >= MIN_CANDIDATE_TURN_WORDS_FOR_PACE &&
            duration >= MIN_CANDIDATE_TURN_DURATION_MS_FOR_PACE) ||
          (wordsCount === 0 && duration >= MIN_CANDIDATE_TURN_DURATION_MS_FOR_PACE);

        if (meetsThreshold) {
          qualifyingCandidateWords += wordsCount;
          qualifyingCandidateDurationMs += duration;
          hasEligibleCandidateTurn = true;
        }
      }

      // Filler words
      if (turn.text) {
        FILLER_WORD_REGEX.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = FILLER_WORD_REGEX.exec(turn.text)) !== null) {
          const canonical = match[1]?.toLowerCase();
          if (canonical) {
            fillerWordCounts[canonical] = (fillerWordCounts[canonical] ?? 0) + 1;
            totalFillerWords++;
          }
        }
      }

      // Talk ratio duration
      if (duration != null && duration > 0) {
        candidateDurationMs += duration;
      }

      // Response latency: check preceding turn
      if (i > 0) {
        const prevTurn = turns[i - 1];
        if (
          prevTurn &&
          prevTurn.speaker === "AI" &&
          turn.startedAt != null &&
          prevTurn.endedAt != null
        ) {
          const pause = Math.max(
            0,
            turn.startedAt.getTime() - prevTurn.endedAt.getTime(),
          );
          pauses.push(pause);
        }
      }
    } else if (isInterviewer) {
      if (duration != null && duration > 0) {
        interviewerDurationMs += duration;
      }
    }
  }

  // Calculate overall WPM
  let overallWpm: number | null = null;
  if (hasEligibleCandidateTurn && qualifyingCandidateDurationMs > 0) {
    overallWpm = Math.round(
      (qualifyingCandidateWords * 60_000) / qualifyingCandidateDurationMs,
    );
  }

  // Calculate talk ratio percentage
  const totalDuration = candidateDurationMs + interviewerDurationMs;
  let candidatePercentage = 0;
  if (totalDuration > 0) {
    candidatePercentage = Math.round((candidateDurationMs / totalDuration) * 100);
  }

  // Calculate average response latency
  let averageResponseLatencyMs: number | null = null;
  if (pauses.length > 0) {
    const sumPauses = pauses.reduce((acc, p) => acc + p, 0);
    averageResponseLatencyMs = Math.round(sumPauses / pauses.length);
  }

  return {
    overallWpm,
    turnWpm,
    fillerWordCounts,
    totalFillerWords,
    talkRatio: {
      candidateDurationMs,
      interviewerDurationMs,
      candidatePercentage,
    },
    averageResponseLatencyMs,
  };
}
