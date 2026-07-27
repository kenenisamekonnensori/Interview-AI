import type { RealtimeEvent } from "@interviewer-ai/types";

type ConversationLogger = { info: (payload: unknown, message: string) => void };

export class ConversationEventPublisher {
  constructor(private readonly logger: ConversationLogger) {}

  publish(event: RealtimeEvent) {
    this.logger.info(
      {
        eventName: event.name,
        interviewId: event.payload.interviewId,
        ...("conversationId" in event.payload
          ? { conversationId: event.payload.conversationId }
          : "conversation" in event.payload
            ? { conversationId: event.payload.conversation.id }
            : {}),
        ...("turn" in event.payload ? { turnId: event.payload.turn.id } : {}),
        ...("turnId" in event.payload ? { turnId: event.payload.turnId } : {}),
      },
      "Conversation event published",
    );
  }
}
