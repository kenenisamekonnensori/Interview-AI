import { randomBytes } from "node:crypto";
import type Redis from "ioredis";

export type VoiceTicket = {
  interviewId: string;
  userId: string;
  createdAt: number;
};

// In-memory fallback map for tickets when Redis is not configured or in monolith mode.
// Tickets have a short 60s TTL, so memory usage is negligible.
const memoryTicketStore = new Map<string, VoiceTicket>();

const TICKET_TTL_SECONDS = 60;

/**
 * Periodically purge expired tickets from memory.
 */
setInterval(() => {
  const now = Date.now();
  for (const [ticket, data] of memoryTicketStore.entries()) {
    if (now - data.createdAt > TICKET_TTL_SECONDS * 1000) {
      memoryTicketStore.delete(ticket);
    }
  }
}, 30_000).unref();

export class VoiceTicketService {
  constructor(private readonly redis?: Redis) {}

  /**
   * Issues a short-lived, single-use ticket for establishing a voice WebSocket connection.
   */
  async createTicket(interviewId: string, userId: string): Promise<string> {
    const ticket = randomBytes(24).toString("hex");
    const payload: VoiceTicket = {
      interviewId,
      userId,
      createdAt: Date.now(),
    };

    if (this.redis) {
      try {
        await this.redis.set(
          `voice:ticket:${ticket}`,
          JSON.stringify(payload),
          "EX",
          TICKET_TTL_SECONDS,
        );
        return ticket;
      } catch (err) {
        // Fallback to memory on transient Redis error
      }
    }

    memoryTicketStore.set(ticket, payload);
    return ticket;
  }

  /**
   * Consumes and validates a voice WebSocket ticket (single-use).
   */
  async consumeTicket(ticket: string, interviewId: string): Promise<VoiceTicket | null> {
    if (this.redis) {
      try {
        const key = `voice:ticket:${ticket}`;
        const data = await this.redis.get(key);
        if (data) {
          await this.redis.del(key);
          const parsed = JSON.parse(data) as VoiceTicket;
          if (parsed.interviewId === interviewId) {
            return parsed;
          }
        }
      } catch {
        // Fallback to memory check
      }
    }

    const memoryTicket = memoryTicketStore.get(ticket);
    if (memoryTicket) {
      memoryTicketStore.delete(ticket);
      if (
        memoryTicket.interviewId === interviewId &&
        Date.now() - memoryTicket.createdAt <= TICKET_TTL_SECONDS * 1000
      ) {
        return memoryTicket;
      }
    }

    return null;
  }
}
