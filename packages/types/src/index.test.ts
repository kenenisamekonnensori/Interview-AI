import { describe, expect, it } from "vitest";
import { interviewReportSchema } from "./index.js";

describe("interviewReportSchema backward compatibility", () => {
  it("deserializes legacy report fixtures lacking speechDelivery, starBreakdown, and exemplars", () => {
    const legacyReportFixture = {
      id: "11111111-1111-4111-8111-111111111111",
      interviewId: "22222222-2222-4222-8222-222222222222",
      status: "READY",
      summary: "Candidate demonstrated strong engineering competency.",
      hiringRecommendation: "HIRE",
      failureReason: null,
      generatedAt: new Date().toISOString(),
      evidence: [
        {
          turnId: "33333333-3333-4333-8333-333333333333",
          claim: "Clear explanation of distributed cache invalidation strategies.",
        },
      ],
      evaluation: {
        overallScore: 82,
        technical: {
          score: 85,
          feedback: "Solid understanding of system boundaries.",
          evidenceTurnIds: ["33333333-3333-4333-8333-333333333333"],
        },
        communication: {
          score: 80,
          feedback: "Articulate and structured answers.",
          evidenceTurnIds: ["33333333-3333-4333-8333-333333333333"],
        },
        confidence: {
          score: 80,
          feedback: "Composed under probing questions.",
          evidenceTurnIds: ["33333333-3333-4333-8333-333333333333"],
        },
        problemSolving: {
          score: 83,
          feedback: "Methodical approach to edge cases.",
          evidenceTurnIds: ["33333333-3333-4333-8333-333333333333"],
        },
        categoryScores: {
          SystemDesign: {
            score: 85,
            feedback: "Addressed caching and consistency tradeoffs well.",
            evidenceTurnIds: ["33333333-3333-4333-8333-333333333333"],
          },
        },
        strengths: [
          {
            text: "Deep understanding of caching patterns.",
            evidenceTurnIds: ["33333333-3333-4333-8333-333333333333"],
          },
        ],
        weaknesses: [],
        missedOpportunities: [],
        recommendations: ["Dive deeper into database replication lag edge cases."],
      },
    };

    const parsed = interviewReportSchema.parse(legacyReportFixture);
    expect(parsed.status).toBe("READY");
    expect(parsed.evaluation?.speechDelivery).toBeUndefined();
    expect(parsed.evaluation?.starBreakdown).toBeUndefined();
    expect(parsed.evaluation?.exemplars).toBeUndefined();
    expect(parsed.evaluation?.overallScore).toBe(82);
  });

  it("deserializes reports containing speechDelivery, starBreakdown, and exemplars", () => {
    const reportWithPhase1Data = {
      id: "11111111-1111-4111-8111-111111111111",
      interviewId: "22222222-2222-4222-8222-222222222222",
      status: "READY",
      summary: "Comprehensive evaluation with speech metrics and STAR breakdown.",
      hiringRecommendation: "STRONG_HIRE",
      failureReason: null,
      generatedAt: new Date().toISOString(),
      evidence: [
        {
          turnId: "33333333-3333-4333-8333-333333333333",
          claim: "Clear evidence of proactive incident management.",
        },
      ],
      evaluation: {
        overallScore: 90,
        technical: {
          score: 92,
          feedback: "Excellent technical depth.",
          evidenceTurnIds: ["33333333-3333-4333-8333-333333333333"],
        },
        communication: {
          score: 88,
          feedback: "Concise and engaging delivery.",
          evidenceTurnIds: ["33333333-3333-4333-8333-333333333333"],
        },
        confidence: {
          score: 90,
          feedback: "Decisive and clear.",
          evidenceTurnIds: ["33333333-3333-4333-8333-333333333333"],
        },
        problemSolving: {
          score: 90,
          feedback: "Root cause analysis was rigorous.",
          evidenceTurnIds: ["33333333-3333-4333-8333-333333333333"],
        },
        categoryScores: {},
        strengths: [],
        weaknesses: [],
        missedOpportunities: [],
        recommendations: [],
        speechDelivery: {
          overallWpm: 145,
          fillerWordCounts: { like: 2, um: 1 },
          totalFillerWords: 3,
          talkRatio: {
            candidateDurationMs: 180000,
            interviewerDurationMs: 60000,
            candidatePercentage: 75,
          },
          averageResponseLatencyMs: 850,
        },
        starBreakdown: {
          "33333333-3333-4333-8333-333333333333": {
            situation: {
              score: 90,
              feedback: "Clear production outage scenario.",
              evidenceTurnIds: ["33333333-3333-4333-8333-333333333333"],
            },
            task: {
              score: 88,
              feedback: "Well defined mitigation goal.",
              evidenceTurnIds: ["33333333-3333-4333-8333-333333333333"],
            },
            action: {
              score: 92,
              feedback: "Took personal ownership (I isolated the faulty canary).",
              evidenceTurnIds: ["33333333-3333-4333-8333-333333333333"],
            },
            result: {
              score: 90,
              feedback: "Downtime capped under 4 minutes with zero data loss.",
              evidenceTurnIds: ["33333333-3333-4333-8333-333333333333"],
            },
          },
        },
        exemplars: [
          {
            turnId: "33333333-3333-4333-8333-333333333333",
            questionText: "Tell me about a time you handled a severe production issue.",
            candidateAnswerSnippet: "We had a server failure and we restarted the cluster.",
            candidateScore: 65,
            exemplarResponse:
              "When our payment gateway latency spiked to 4 seconds affecting 20% of checkouts, I led the triage...",
            improvementRationale:
              "Replaces passive 'we' language with specific metrics, active ownership, and root-cause mitigation.",
          },
        ],
      },
    };

    const parsed = interviewReportSchema.parse(reportWithPhase1Data);
    expect(parsed.evaluation?.speechDelivery?.overallWpm).toBe(145);
    expect(parsed.evaluation?.speechDelivery?.totalFillerWords).toBe(3);
    expect(parsed.evaluation?.starBreakdown?.["33333333-3333-4333-8333-333333333333"]?.action.score).toBe(92);
    expect(parsed.evaluation?.exemplars?.[0]?.candidateScore).toBe(65);
  });
});
