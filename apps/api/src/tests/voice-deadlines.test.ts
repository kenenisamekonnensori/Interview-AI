import { describe, expect, it, vi } from "vitest";

import {
  DeepgramDeadlineError,
  bufferAudioStream,
  voiceTtsChunkIdleDeadlineMs,
  withVoiceDeadline,
} from "../modules/conversation/deepgram.js";

/**
 * Phase 0 deadline guarantees: no voice-provider network segment may hang past
 * its deadline — a stalled provider becomes a fast, typed failure the caller
 * degrades on, never minutes of silent waiting.
 */

describe("withVoiceDeadline", () => {
  it("resolves with the operation result when it completes before the deadline", async () => {
    vi.useFakeTimers();
    try {
      const result = await withVoiceDeadline("test-segment", 5_000, async () => "value");
      expect(result).toBe("value");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects with DeepgramDeadlineError when the operation outruns the deadline", async () => {
    vi.useFakeTimers();
    try {
      // Attach the rejection handler BEFORE the deadline expires: under fake
      // timers the rejection fires during timer advance, so the expectation
      // must already be listening to avoid an unhandled rejection.
      const assertion = expect(
        withVoiceDeadline("test-segment", 1_000, () => new Promise(() => {})),
      ).rejects.toBeInstanceOf(DeepgramDeadlineError);
      await vi.advanceTimersByTimeAsync(1_001);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports the segment and deadline on the raised error", async () => {
    vi.useFakeTimers();
    try {
      const assertion = expect(
        withVoiceDeadline("tts-generate", 500, () => new Promise(() => {})),
      ).rejects.toMatchObject({ segment: "tts-generate", deadlineMs: 500 });
      await vi.advanceTimersByTimeAsync(501);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("bufferAudioStream idle deadline", () => {
  /** A controlled async iterator: chunks arrive exactly when the test pushes them. */
  function manualStream() {
    type Next = { value: Uint8Array; done: false } | { value: undefined; done: true };
    const resolvers: Array<(next: Next) => void> = [];
    return {
      [Symbol.asyncIterator]() {
        return {
          next: () =>
            new Promise<Next>((resolve) => {
              resolvers.push(resolve);
            }),
        };
      },
      emit(value: Uint8Array) {
        resolvers.shift()?.({ value, done: false });
      },
      close() {
        resolvers.shift()?.({ value: undefined, done: true });
      },
    };
  }

  it("buffers all chunks when the stream completes with progress", async () => {
    vi.useFakeTimers();
    try {
      const stream = manualStream();
      const buffered = bufferAudioStream(stream as unknown as AsyncIterable<Uint8Array>);
      const assertion = expect(buffered).resolves;

      await Promise.resolve(); // flush iteration start
      stream.emit(new Uint8Array([1, 2]));
      await vi.advanceTimersByTimeAsync(1_000);
      stream.emit(new Uint8Array([3]));
      await vi.advanceTimersByTimeAsync(1_000);
      stream.close();

      await assertion.toEqual(Buffer.from([1, 2, 3]));
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets the idle clock whenever a chunk arrives", async () => {
    vi.useFakeTimers();
    try {
      const stream = manualStream();
      const buffered = bufferAudioStream(
        stream as unknown as AsyncIterable<Uint8Array>,
        voiceTtsChunkIdleDeadlineMs,
      );
      const assertion = expect(buffered).resolves;

      await Promise.resolve();
      stream.emit(new Uint8Array([1]));
      await vi.advanceTimersByTimeAsync(voiceTtsChunkIdleDeadlineMs - 500);
      stream.emit(new Uint8Array([2]));
      await vi.advanceTimersByTimeAsync(voiceTtsChunkIdleDeadlineMs - 500);
      stream.close();

      await assertion.toEqual(Buffer.from([1, 2]));
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects with DeepgramDeadlineError when the stream stalls", async () => {
    vi.useFakeTimers();
    try {
      const stream = manualStream();
      const buffered = bufferAudioStream(stream as unknown as AsyncIterable<Uint8Array>);
      // Listener attached before the deadline fires (fake-timer determinism).
      const assertion = expect(buffered).rejects.toBeInstanceOf(DeepgramDeadlineError);

      await Promise.resolve();
      stream.emit(new Uint8Array([1])); // resets once, then true silence
      await vi.advanceTimersByTimeAsync(voiceTtsChunkIdleDeadlineMs + 1);

      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("fires the idle deadline only after a full silent window despite earlier sub-deadline gaps", async () => {
    vi.useFakeTimers();
    try {
      const stream = manualStream();
      const buffered = bufferAudioStream(
        stream as unknown as AsyncIterable<Uint8Array>,
        voiceTtsChunkIdleDeadlineMs,
      );
      const assertion = expect(buffered).rejects.toBeInstanceOf(DeepgramDeadlineError);

      await Promise.resolve();
      stream.emit(new Uint8Array([1]));
      // Two near-deadline gaps kept open by a fresh chunk each time: the
      // provider is actively streaming, so no deadline may fire yet.
      await vi.advanceTimersByTimeAsync(voiceTtsChunkIdleDeadlineMs - 100);
      stream.emit(new Uint8Array([2]));
      await vi.advanceTimersByTimeAsync(voiceTtsChunkIdleDeadlineMs - 100);
      // Now a genuinely silent window — the stream stays OPEN (close() is
      // never called, so `done` is never delivered) and no chunk arrives for
      // longer than the idle deadline.
      await vi.advanceTimersByTimeAsync(voiceTtsChunkIdleDeadlineMs + 1);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
