import type { RealtimeEvent } from "@interviewer-ai/types";

type ConversationLogger = { info: (payload: unknown, message: string) => void };

export class ConversationEventPublisher {
  constructor(private readonly logger: ConversationLogger) {}

  publish(event: RealtimeEvent) {
    this.logger.info({ event }, "Conversation event published");
  }
}
