import type { Prisma, PrismaClient } from "../../../prisma/generated/client.js";
import type { ConversationState, ConversationTurnType } from "@interviewer-ai/types";

type Database = PrismaClient | Prisma.TransactionClient;

export class ConversationRepository {
  constructor(private readonly database: PrismaClient) {}

  findActiveOwned(interviewId: string, userId: string) {
    return this.database.conversation.findFirst({
      where: {
        interviewId,
        interview: { userId, status: "IN_PROGRESS" },
      },
      include: {
        interview: { include: { plan: true, memory: true } },
        turns: { orderBy: { sequence: "desc" }, take: 12 },
      },
    });
  }

  findOwnedTurn(interviewId: string, turnId: string, userId: string) {
    return this.database.conversationTurn.findFirst({
      where: {
        id: turnId,
        conversation: { interviewId, interview: { userId } },
      },
      include: { conversation: { include: { interview: true } } },
    });
  }

  findOwnedAiTurn(interviewId: string, turnId: string, userId: string) {
    return this.database.conversationTurn.findFirst({
      where: {
        id: turnId,
        speaker: "AI",
        conversation: { interviewId, interview: { userId } },
      },
      include: { conversation: { include: { interview: true } } },
    });
  }

  findOwnedConversation(interviewId: string, userId: string) {
    return this.database.conversation.findFirst({
      where: { interviewId, interview: { userId } },
      include: { interview: true },
    });
  }

  findOwnedInterview(interviewId: string, userId: string) {
    return this.database.interview.findFirst({ where: { id: interviewId, userId } });
  }

  async appendTurn(
    tx: Database,
    input: {
      conversationId: string;
      expectedSequence: number;
      expectedState: ConversationState;
      nextState: ConversationState;
      speaker: "USER" | "AI" | "SYSTEM";
      type: ConversationTurnType;
      text: string;
    },
  ) {
    const claimed = await tx.conversation.updateMany({
      where: {
        id: input.conversationId,
        sequence: input.expectedSequence,
        state: input.expectedState,
      },
      data: { sequence: input.expectedSequence + 1, state: input.nextState },
    });
    if (!claimed.count) return null;
    return tx.conversationTurn.create({
      data: {
        conversationId: input.conversationId,
        sequence: input.expectedSequence + 1,
        speaker: input.speaker,
        type: input.type,
        text: input.text,
      },
    });
  }

  async moveState(
    tx: Database,
    input: {
      conversationId: string;
      expectedState: ConversationState;
      nextState: ConversationState;
    },
  ) {
    return tx.conversation.updateMany({
      where: { id: input.conversationId, state: input.expectedState },
      data: { state: input.nextState },
    });
  }

  updateMemory(
    tx: Database,
    interviewId: string,
    data: {
      askedQuestions: string[];
      topicCoverage: Array<{ topic: string; outcome: string }>;
      candidateStrengths: string[];
      weakAreas: string[];
      missedFollowUps: string[];
      questionDifficulty: "EASY" | "MEDIUM" | "HARD" | "EXPERT";
      remainingObjectives: string[];
    },
  ) {
    return tx.interviewMemory.upsert({
      where: { interviewId },
      create: { interviewId, ...data },
      update: data,
    });
  }
}
