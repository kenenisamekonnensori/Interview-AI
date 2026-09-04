"use client";

import { useEffect, useRef } from "react";
import type { RealtimeEvent, RealtimeEventName } from "@interviewer-ai/types";

import { webEnvironment } from "@/lib/env";

type EventPayload = RealtimeEvent["payload"];
type StreamHandlers = Partial<Record<RealtimeEventName, (payload: EventPayload) => void>>;

/**
 * Subscribes to the interview's realtime event stream (SSE) and dispatches
 * typed events to the provided handlers. Events are signals to re-read
 * authoritative state, so handlers typically invalidate React Query data.
 *
 * EventSource reconnects natively after any drop; `onResync` fires on every
 * open (including the first) so callers refetch and never miss state that
 * changed while the stream was disconnected.
 */
export function useConversationStream(
  interviewId: string,
  handlers: StreamHandlers,
  onResync?: () => void,
  enabled = true,
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const onResyncRef = useRef(onResync);
  onResyncRef.current = onResync;

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let source: EventSource | null = null;
    const baseUrl = webEnvironment.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
    const url = `${baseUrl}/api/v1/interviews/${interviewId}/conversation/stream`;

    const connect = () => {
      if (disposed) return;
      source = new EventSource(url, { withCredentials: true });
      // Fires on the first open and after every native reconnect.
      source.onopen = () => onResyncRef.current?.();
      for (const name of Object.keys(handlersRef.current) as RealtimeEventName[]) {
        source.addEventListener(name, (message) => {
          const payload = parsePayload(message);
          if (payload === null) return;
          try {
            // The dispatch site is untyped by design: the server payload is
            // trusted to match the event name, and each handler is typed for it.
            (handlersRef.current[name] as ((payload: unknown) => void) | undefined)?.(payload);
          } catch (cause) {
            console.error("[Conversation Stream] Event handler failed:", cause);
          }
        });
      }
    };

    connect();
    return () => {
      disposed = true;
      source?.close();
      source = null;
    };
  }, [interviewId, enabled]);
}

function parsePayload(message: Event): unknown {
  const data = (message as MessageEvent).data;
  if (typeof data !== "string" || data.length === 0) return null;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return null;
  }
}
