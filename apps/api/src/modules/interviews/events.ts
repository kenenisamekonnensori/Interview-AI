import type { RealtimeEvent } from "@interviewer-ai/types";

type LifecycleLogger = { info: (payload: unknown, message: string) => void };

/**
 * The transport is intentionally replaceable. Lifecycle events are emitted only
 * after their database transaction has committed.
 */
export class InterviewEventPublisher {
  constructor(private readonly logger: LifecycleLogger) {}

  publish(event: RealtimeEvent) {
    this.logger.info(
      {
        eventName: event.name,
        interviewId: event.payload.interviewId,
        ...("conversationId" in event.payload
          ? { conversationId: event.payload.conversationId }
          : {}),
      },
      "Interview lifecycle event published",
    );
  }
}
