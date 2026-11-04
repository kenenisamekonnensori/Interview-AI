import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../prisma/generated/client.js";
import { ReportService } from "../modules/reports/service.js";
import type { AiProvider } from "../modules/ai/provider.js";
import type { ServerEnvironment } from "@interviewer-ai/config";
import type { InterviewEventPublisher } from "../modules/interviews/events.js";

describe("ReportService Generation with STAR & Speech Delivery (Acceptance Check 4)", () => {
  it("generates and saves READY report with speechDelivery, starBreakdown, and exemplars", async () => {
    const interviewId = "22222222-2222-4222-8222-222222222222";
    const userId = "33333333-3333-4333-8333-333333333333";
    const turnAiId = "44444444-4444-4444-8444-444444444444";
    const turnUserId = "55555555-5555-4555-8555-555555555555";

    // In-memory persisted report store
    let persistedReport: any = {
      interviewId,
      status: "PENDING",
      generationAttempts: 0,
      evaluation: null,
      summary: null,
      evidence: [],
      hiringRecommendation: null,
      failureReason: null,
    };

    const mockInterview = {
      id: interviewId,
      userId,
      status: "COMPLETED",
      interviewType: "BEHAVIORAL",
      difficulty: "HARD",
      durationMinutes: 30,
      targetRole: "Staff Software Engineer",
      plan: {
        objectives: ["Evaluate leadership and incident response"],
        topics: [{ topic: "Production Incidents", priority: "HIGH", minutes: 15 }],
        evaluationRubric: ["STAR structure", "active ownership"],
      },
      memory: null,
      resume: null,
      jobDescription: null,
      conversation: {
        state: "COMPLETED",
        turns: [
          {
            id: turnAiId,
            conversationId: "conv-1",
            sequence: 1,
            speaker: "AI",
            type: "QUESTION",
            text: "Tell me about a high-severity production outage you navigated.",
            createdAt: new Date("2026-11-03T10:00:00Z"),
            startedAt: new Date("2026-11-03T10:00:00Z"),
            endedAt: new Date("2026-11-03T10:00:05Z"),
            durationMs: 5_000,
            words: null,
          },
          {
            id: turnUserId,
            conversationId: "conv-1",
            sequence: 2,
            speaker: "USER",
            type: "ANSWER",
            text: "Um, we had a server issue like basically our database crashed and we restarted it.",
            createdAt: new Date("2026-11-03T10:00:06Z"),
            startedAt: new Date("2026-11-03T10:00:06Z"),
            endedAt: new Date("2026-11-03T10:00:26Z"),
            durationMs: 20_000,
            words: null,
          },
        ],
      },
    };

    const mockPrisma = {
      interviewReport: {
        updateMany: vi.fn(async ({ where, data }) => {
          if (where.interviewId === interviewId) {
            persistedReport = { ...persistedReport, ...data };
            return { count: 1 };
          }
          return { count: 0 };
        }),
        findFirst: vi.fn(async () => persistedReport),
      },
      interview: {
        findUnique: vi.fn(async () => mockInterview),
      },
    } as unknown as PrismaClient;

    const mockAiReportData = {
      summary: "Candidate answered behavioral questions but lacked personal ownership in incidents.",
      hiringRecommendation: "NO_HIRE",
      evidence: [
        {
          turnId: turnUserId,
          claim: "Passive language used when describing outage recovery.",
        },
      ],
      evaluation: {
        overallScore: 64,
        technical: {
          score: 62,
          feedback: "Technical response lacked root-cause depth.",
          evidenceTurnIds: [turnUserId],
        },
        communication: {
          score: 65,
          feedback: "Frequent filler words and passive voice.",
          evidenceTurnIds: [turnUserId],
        },
        confidence: {
          score: 63,
          feedback: "Hesitant answer delivery.",
          evidenceTurnIds: [turnUserId],
        },
        problemSolving: {
          score: 66,
          feedback: "Solution was reactive rather than preventative.",
          evidenceTurnIds: [turnUserId],
        },
        categoryScores: {
          IncidentResponse: {
            score: 62,
            feedback: "Did not detail blast radius containment.",
            evidenceTurnIds: [turnUserId],
          },
        },
        strengths: [],
        weaknesses: [
          {
            text: "Overuse of team passive voice ('we') rather than active ownership.",
            evidenceTurnIds: [turnUserId],
          },
        ],
        missedOpportunities: [
          {
            text: "Missed opportunity to explain automated circuit breakers.",
            evidenceTurnIds: [turnUserId],
          },
        ],
        recommendations: [
          "Structure behavioral stories using STAR with quantifiable impact metrics.",
        ],
        starBreakdown: {
          [turnUserId]: {
            situation: {
              score: 65,
              feedback: "High-traffic database crash described briefly.",
              evidenceTurnIds: [turnUserId],
            },
            task: {
              score: 60,
              feedback: "Individual role was not defined.",
              evidenceTurnIds: [turnUserId],
            },
            action: {
              score: 58,
              feedback: "Used 'we restarted' without detailing personal triage steps.",
              evidenceTurnIds: [turnUserId],
            },
            result: {
              score: 65,
              feedback: "Service recovered but metrics and MTTR were omitted.",
              evidenceTurnIds: [turnUserId],
            },
          },
        },
        exemplars: [
          {
            turnId: turnUserId,
            questionText: "Tell me about a high-severity production outage you navigated.",
            candidateAnswerSnippet: "we had a server issue like basically our database crashed and we restarted it",
            candidateScore: 62,
            exemplarResponse:
              "When our primary PostgreSQL cluster experienced connection exhaustion during peak Cyber Monday traffic, causing 500 errors on 12% of checkouts, I led the emergency response. Within 3 minutes, I isolated non-critical read queries by shifting traffic to read replicas and adjusted pgBouncer pool limits. To prevent recurrence, I implemented automated circuit breakers, cutting recovery time by 80% in subsequent load spikes.",
            improvementRationale:
              "Replaces passive 'we' language with personal ownership ('I led', 'I isolated'), quantifies business impact and blast radius, and explains root cause prevention.",
          },
        ],
      },
    };

    const mockAiProvider: AiProvider = {
      createInterviewPlan: vi.fn(),
      generateInterviewerResponse: vi.fn(),
      evaluateInterview: vi.fn(),
      generateReport: vi.fn(),
      generateStructured: vi.fn(async (_req, parse) => parse(mockAiReportData)),
    };

    const mockEnv = {
      GEMINI_MODEL: "gemini-2.0-flash",
    } as unknown as ServerEnvironment;

    const mockQueue = {
      enqueue: vi.fn(),
    } as any;

    const mockEvents: InterviewEventPublisher = {
      publish: vi.fn(),
    } as any;

    const service = new ReportService(
      mockPrisma,
      mockEnv,
      mockQueue,
      mockEvents,
      undefined,
      undefined,
      undefined,
      mockAiProvider,
    );

    await service.generate(interviewId);

    // Verify report was persisted with READY status
    expect(persistedReport.status).toBe("READY");

    // Verify persisted JSON includes speechDelivery, starBreakdown, and exemplars
    const evaluation = persistedReport.evaluation;
    expect(evaluation).toBeDefined();

    // 1. STAR Breakdown
    expect(evaluation.starBreakdown).toBeDefined();
    expect(evaluation.starBreakdown[turnUserId]).toBeDefined();
    expect(evaluation.starBreakdown[turnUserId].situation.score).toBe(65);
    expect(evaluation.starBreakdown[turnUserId].action.score).toBe(58);

    // 2. Exemplar
    expect(evaluation.exemplars).toBeDefined();
    expect(evaluation.exemplars.length).toBe(1);
    expect(evaluation.exemplars[0].candidateScore).toBe(62);
    expect(evaluation.exemplars[0].turnId).toBe(turnUserId);
    expect(evaluation.exemplars[0].exemplarResponse).toContain("PostgreSQL cluster");

    // 3. Speech Delivery metrics calculated from turns
    expect(evaluation.speechDelivery).toBeDefined();
    expect(evaluation.speechDelivery.overallWpm).toBeDefined();
    expect(evaluation.speechDelivery.totalFillerWords).toBeGreaterThan(0);
    expect(evaluation.speechDelivery.fillerWordCounts.um).toBe(1);
    expect(evaluation.speechDelivery.fillerWordCounts.like).toBe(1);
    expect(evaluation.speechDelivery.fillerWordCounts.basically).toBe(1);
    expect(evaluation.speechDelivery.averageResponseLatencyMs).toBe(1_000); // 10:00:06 - 10:00:05 = 1s = 1000ms
  });
});
