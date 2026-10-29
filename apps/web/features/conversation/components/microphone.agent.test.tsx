// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { audioQueue } from "./audio-queue";
import { InterviewMicrophone, type VoiceSessionState } from "./microphone";

/**
 * Browser-level coverage for the server-owned agent voice pipeline: a jsdom
 * document runs the real `InterviewMicrophone`, backed by a fake WebSocket
 * (the gateway), a fake Web Audio stack (playback scheduling) and a mocked
 * `fetch` (the REST endpoints). The lifecycle under test is the one that keeps
 * the conversation moving: streamed PCM must finish playing before the turn is
 * acknowledged, because playback-completed is what returns the interview to
 * LISTENING.
 */

vi.mock("@deepgram/sdk", () => ({
  DeepgramClient: class {
    listen = { v1: { connect: vi.fn() } };
  },
}));

vi.mock("./voice-visualizer", () => ({
  VoiceVisualizer: () => <div data-testid="voice-visualizer" />,
}));

vi.mock("./mic-diagnostic", () => ({
  MicDiagnostic: ({ onComplete }: { onComplete: (stream?: MediaStream) => void }) => {
    const stream = {
      active: true,
      id: "diagnostic-stream",
      getTracks: () => [{ kind: "audio", readyState: "live", stop: () => {} }],
      getAudioTracks: () => [{ kind: "audio", readyState: "live", stop: () => {} }],
    } as unknown as MediaStream;
    return (
      <button type="button" onClick={() => onComplete(stream)}>
        Start microphone test
      </button>
    );
  },
}));

vi.mock("./audio-queue", () => ({
  audioQueue: {
    unlockAudio: vi.fn(async () => true),
    cancelAll: vi.fn(),
    enqueue: vi.fn(),
  },
}));

type SocketListener = (event?: unknown) => void;

/** Stands in for the browser WebSocket connected to the agent gateway. */
class FakeAgentSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static readonly instances: FakeAgentSocket[] = [];

  readyState = FakeAgentSocket.CONNECTING;
  binaryType = "blob";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  readonly sent: Array<string | ArrayBuffer> = [];
  private readonly listeners = new Map<string, Array<{ fn: SocketListener; once: boolean }>>();

  constructor(readonly url: string) {
    FakeAgentSocket.instances.push(this);
  }

  addEventListener(type: string, fn: SocketListener, options?: { once?: boolean }) {
    const entries = this.listeners.get(type) ?? [];
    entries.push({ fn, once: options?.once ?? false });
    this.listeners.set(type, entries);
  }

  removeEventListener(type: string, fn: SocketListener) {
    const entries = this.listeners.get(type);
    if (!entries) return;
    this.listeners.set(
      type,
      entries.filter((entry) => entry.fn !== fn),
    );
  }

  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }

  close() {
    if (this.readyState === FakeAgentSocket.CLOSED) return;
    this.readyState = FakeAgentSocket.CLOSED;
    const event = { code: 1000, reason: "" };
    this.onclose?.(event);
    this.emit("close", event);
  }

  /** The provider accepted the session. */
  open() {
    this.readyState = FakeAgentSocket.OPEN;
    this.onopen?.();
    this.emit("open", {});
  }

  /** One JSON control message from the gateway. */
  deliver(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  /** One binary PCM frame from the gateway. */
  deliverAudio(frame: ArrayBuffer) {
    this.onmessage?.({ data: frame });
  }

  private emit(type: string, event: unknown) {
    const entries = this.listeners.get(type) ?? [];
    for (const entry of [...entries]) {
      if (entry.once) this.removeEventListener(type, entry.fn);
      entry.fn(event);
    }
  }
}

type FakeSource = {
  onended: (() => void) | null;
  connect: () => void;
  disconnect: () => void;
  start: () => void;
  stop: () => void;
};

type FakeProcessor = {
  onaudioprocess:
    | ((event: { inputBuffer: { getChannelData: (channel: number) => Float32Array } }) => void)
    | null;
  connect: () => void;
  disconnect: () => void;
};

/** Scheduled PCM chunks from every fake AudioContext in the current test. */
let scheduledSources: FakeSource[] = [];
/** Chunks cancelled by `stop()` (barge-in or teardown). */
let stoppedSources: FakeSource[] = [];
/** Capture processors the component feeds with microphone PCM. */
let micProcessors: FakeProcessor[] = [];

/** Stands in for Web Audio; `sources` stay "playing" until the test ends them. */
class FakeAudioContext {
  readonly sampleRate: number;
  currentTime = 0;
  destination = {};
  state = "running";

  constructor(options?: { sampleRate?: number }) {
    this.sampleRate = options?.sampleRate ?? 48_000;
  }

  resume() {
    return Promise.resolve();
  }

  close() {
    return Promise.resolve();
  }

  createBuffer(_channels: number, length: number, sampleRate: number) {
    return { duration: length / sampleRate, getChannelData: () => new Float32Array(length) };
  }

  createBufferSource(): FakeSource {
    const source: FakeSource = {
      onended: null,
      connect: () => {},
      disconnect: () => {},
      start: () => {},
      stop: () => {
        stoppedSources.push(source);
      },
    };
    scheduledSources.push(source);
    return source;
  }

  createGain() {
    return { gain: { value: 1 }, connect: () => {}, disconnect: () => {} };
  }

  createMediaStreamSource() {
    return { connect: () => {}, disconnect: () => {} };
  }

  createScriptProcessor(): FakeProcessor {
    const processor: FakeProcessor = {
      onaudioprocess: null,
      connect: () => {},
      disconnect: () => {},
    };
    micProcessors.push(processor);
    return processor;
  }
}

/** Emits one block of microphone PCM through the agent capture processor. */
function sendMicFrame() {
  for (const processor of micProcessors) {
    processor.onaudioprocess?.({
      inputBuffer: { getChannelData: () => new Float32Array(512).fill(0.5) },
    });
  }
}

/** Microphone PCM frames actually forwarded to the gateway socket. */
function forwardedMicFrames(socket: FakeAgentSocket) {
  return socket.sent.filter((frame) => frame instanceof ArrayBuffer).length;
}

/** Plays out every scheduled PCM chunk, letting `whenIdle()` resolve. */
function finishScheduledAudio() {
  const sources = scheduledSources;
  scheduledSources = [];
  for (const source of sources) source.onended?.();
}

type ApiCall = { path: string; method: string };

let apiCalls: ApiCall[] = [];
let playbackCompleted: { ok: boolean; body: unknown } = { ok: true, body: { state: "LISTENING" } };

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 409,
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function playbackAcks() {
  return apiCalls.filter((call) => call.path.endsWith("/playback-completed"));
}

beforeEach(() => {
  vi.clearAllMocks();
  FakeAgentSocket.instances.length = 0;
  scheduledSources = [];
  stoppedSources = [];
  micProcessors = [];
  apiCalls = [];
  playbackCompleted = { ok: true, body: { state: "LISTENING" } };

  vi.stubGlobal("WebSocket", FakeAgentSocket);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal(
    "MediaRecorder",
    class {
      static isTypeSupported() {
        return true;
      }
      start() {}
      stop() {}
    },
  );
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => null) },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      apiCalls.push({ path, method: init?.method ?? "GET" });
      if (path.endsWith("/conversation/start")) {
        return jsonResponse({ conversation: { state: "LISTENING" }, greeting: null });
      }
      if (path.endsWith("/voice-token")) {
        return jsonResponse({
          pipeline: "agent",
          streamPath: "/api/v1/interviews/interview-1/voice",
        });
      }
      if (path.endsWith("/playback-completed")) {
        return jsonResponse(playbackCompleted.body, playbackCompleted.ok);
      }
      if (path.endsWith("/conversation/transcripts")) {
        return jsonResponse({
          turn: { id: "turn-user", text: "typed answer" },
          state: "LISTENING",
          nextResponse: { turn: { id: "turn-9", text: "What would you change?" } },
        });
      }
      return jsonResponse({});
    }),
  );
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Waits for the next gateway socket and completes its handshake. */
async function waitForSocket(ordinal: number) {
  await waitFor(() => expect(FakeAgentSocket.instances).toHaveLength(ordinal), { timeout: 3_000 });
  const socket = FakeAgentSocket.instances[ordinal - 1];
  if (!socket) throw new Error(`The client never opened gateway socket ${ordinal}.`);
  await act(async () => {
    socket.open();
  });
  return socket;
}

/** Turns queued for the HTML-audio playback path (request-driven turns). */
function queuedTurns() {
  return vi.mocked(audioQueue.enqueue).mock.calls.map(([item]) => item);
}

/** Renders the component, passes the mic check, and waits for the agent session. */
async function startAgentSession({
  onInterviewCompleted,
  onServerAiTurn,
}: {
  onInterviewCompleted?: () => void;
  onServerAiTurn?: (handler: (turn: { id: string; text: string; type?: string }) => void) => void;
} = {}) {
  const states: VoiceSessionState[] = [];
  render(
    <InterviewMicrophone
      interviewId="interview-1"
      onSessionStateChange={(next) => states.push(next)}
      {...(onInterviewCompleted ? { onInterviewCompleted } : {})}
      {...(onServerAiTurn ? { onServerAiTurn } : {})}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Start microphone test" }));
  await waitFor(() => expect(FakeAgentSocket.instances).toHaveLength(1));
  const socket = FakeAgentSocket.instances[0];
  if (!socket) throw new Error("The agent gateway socket was never opened.");
  expect(socket.url).toBe("ws://localhost:4000/api/v1/interviews/interview-1/voice");
  await act(async () => {
    socket.open();
  });
  await waitFor(() => expect(states).toContain("LISTENING"));
  return { socket, states };
}

async function deliverTurn(
  socket: FakeAgentSocket,
  turn: { id: string; text: string },
  { audioFrames = 1, closing = false }: { audioFrames?: number; closing?: boolean } = {},
) {
  await act(async () => {
    socket.deliver({ type: "agent-turn", turn, state: "SPEAKING" });
  });
  if (closing) {
    // The gateway marks the conversation CLOSING before it streams the farewell.
    await act(async () => {
      socket.deliver({ type: "agent-closing", turnId: turn.id });
    });
  }
  for (let frame = 0; frame < audioFrames; frame += 1) {
    await act(async () => {
      socket.deliverAudio(new Int16Array([frame + 1, 2, 3, 4]).buffer);
    });
  }
  await act(async () => {
    socket.deliver({ type: "agent-audio-done", turnId: turn.id });
  });
}

describe("agent voice turn lifecycle", () => {
  it("acknowledges a turn only after its streamed audio has finished playing", async () => {
    const { socket } = await startAgentSession();

    await deliverTurn(socket, { id: "turn-1", text: "Tell me about caching." });
    expect(await screen.findByText("Tell me about caching.")).toBeTruthy();

    // Every frame is queued and the provider is done sending, but the browser
    // is still playing: no acknowledgement yet.
    expect(scheduledSources.length).toBeGreaterThan(0);
    expect(playbackAcks()).toHaveLength(0);

    await act(async () => {
      finishScheduledAudio();
    });
    await waitFor(() => expect(playbackAcks()).toHaveLength(1));
    expect(playbackAcks()[0]?.path).toBe(
      "/api/v1/interviews/interview-1/conversation/turns/turn-1/playback-completed",
    );
    expect(playbackAcks()[0]?.method).toBe("POST");

    // A retried agent-turn for the same id must neither duplicate the caption
    // nor acknowledge twice.
    await act(async () => {
      socket.deliver({
        type: "agent-turn",
        turn: { id: "turn-1", text: "Tell me about caching." },
      });
    });
    expect(screen.getAllByText("Tell me about caching.")).toHaveLength(1);
    expect(playbackAcks()).toHaveLength(1);
  });

  it("resumes listening and keeps acknowledging later turns when an ack fails", async () => {
    playbackCompleted = {
      ok: false,
      body: { code: "CONVERSATION_STATE_CONFLICT", message: "The state changed concurrently." },
    };
    const { socket, states } = await startAgentSession();

    await deliverTurn(socket, { id: "turn-2", text: "Where would you cache this?" });
    await act(async () => {
      finishScheduledAudio();
    });
    await waitFor(() => expect(playbackAcks()).toHaveLength(1));
    await waitFor(() => expect(states.at(-1)).toBe("LISTENING"));
    expect(screen.queryByText(/concurrently/)).toBeNull();

    // The failed acknowledgement must not wedge the client: the next turn is
    // still played and acknowledged.
    playbackCompleted = { ok: true, body: { state: "LISTENING" } };
    await deliverTurn(
      socket,
      { id: "turn-3", text: "How would you invalidate it?" },
      { audioFrames: 2 },
    );
    expect(scheduledSources).toHaveLength(2);
    await act(async () => {
      finishScheduledAudio();
    });
    await waitFor(() => expect(playbackAcks()).toHaveLength(2));
    expect(playbackAcks()[1]?.path).toBe(
      "/api/v1/interviews/interview-1/conversation/turns/turn-3/playback-completed",
    );
  });

  it("completes the interview only after the closing turn has finished playing", async () => {
    const onInterviewCompleted = vi.fn();
    playbackCompleted = { ok: true, body: { state: "COMPLETED" } };
    const { socket, states } = await startAgentSession({ onInterviewCompleted });

    await deliverTurn(
      socket,
      { id: "turn-closing", text: "Thank you for your time, and best of luck!" },
      { closing: true },
    );

    expect(await screen.findByText("Thank you for your time, and best of luck!")).toBeTruthy();
    expect(states.at(-1)).toBe("CLOSING");

    // The farewell is still playing: no acknowledgement and no completion yet.
    expect(playbackAcks()).toHaveLength(0);
    expect(onInterviewCompleted).not.toHaveBeenCalled();

    await act(async () => {
      finishScheduledAudio();
    });
    await waitFor(() => expect(onInterviewCompleted).toHaveBeenCalledTimes(1));
    expect(playbackAcks()).toHaveLength(1);
    expect(playbackAcks()[0]?.path).toBe(
      "/api/v1/interviews/interview-1/conversation/turns/turn-closing/playback-completed",
    );

    // A completed interview never falls back into listening.
    expect(states.at(-1)).toBe("CLOSING");
    expect(states.slice(states.indexOf("CLOSING"))).not.toContain("LISTENING");
  });

  it("reconnects with fresh credentials and keeps replayed history intact", async () => {
    const { socket, states } = await startAgentSession();
    await deliverTurn(socket, { id: "turn-6", text: "Describe a hard bug." });
    await act(async () => {
      finishScheduledAudio();
    });
    await waitFor(() => expect(playbackAcks()).toHaveLength(1));

    // The gateway connection drops; the client must recover on its own.
    await act(async () => {
      socket.close();
    });
    await waitFor(() => expect(states.at(-1)).toBe("RECONNECTING"));
    await waitFor(() => expect(FakeAgentSocket.instances).toHaveLength(2), { timeout: 3_000 });

    const reconnect = FakeAgentSocket.instances[1];
    if (!reconnect) throw new Error("The client never reconnected to the agent gateway.");
    expect(reconnect.url).toBe(socket.url);
    // A reconnect is a new provider session: credentials are fetched again.
    expect(apiCalls.filter((call) => call.path.endsWith("/voice-token"))).toHaveLength(2);

    await act(async () => {
      reconnect.open();
    });
    await waitFor(() => expect(states.at(-1)).toBe("LISTENING"));

    // History lives on the server and is replayed through provider context: the
    // client neither restarts the conversation nor loses what was already said.
    expect(apiCalls.filter((call) => call.path.endsWith("/conversation/start"))).toHaveLength(1);
    expect(screen.getByText("Describe a hard bug.")).toBeTruthy();

    // The gateway replays the persisted transcript through provider history; a
    // re-delivered turn must not duplicate the caption or be acknowledged twice.
    await act(async () => {
      reconnect.deliver({
        type: "agent-turn",
        turn: { id: "turn-6", text: "Describe a hard bug." },
        state: "SPEAKING",
      });
    });
    expect(screen.getAllByText("Describe a hard bug.")).toHaveLength(1);
    expect(playbackAcks()).toHaveLength(1);

    // The recovered session keeps working: the next question plays and is acknowledged.
    await deliverTurn(reconnect, { id: "turn-7", text: "How did you find it?" });
    expect(await screen.findByText("How did you find it?")).toBeTruthy();
    await act(async () => {
      finishScheduledAudio();
    });
    await waitFor(() => expect(playbackAcks()).toHaveLength(2));
    expect(playbackAcks()[1]?.path).toBe(
      "/api/v1/interviews/interview-1/conversation/turns/turn-7/playback-completed",
    );
  });

  it("plays the server-pushed silence nudge during an agent session", async () => {
    let pushServerTurn: ((turn: { id: string; text: string; type?: string }) => void) | null = null;
    const { socket, states } = await startAgentSession({
      onServerAiTurn: (handler) => {
        pushServerTurn = handler;
      },
    });

    // The gateway publishes its own turns over SSE too; the websocket already
    // owns those, so the bridge must ignore them or every question plays twice.
    await act(async () => {
      pushServerTurn?.({ id: "turn-sse", text: "Must not play twice.", type: "QUESTION" });
    });
    expect(screen.queryByText("Must not play twice.")).toBeNull();
    expect(queuedTurns()).toHaveLength(0);

    // The canned nudge is created by the backend watchdog and only travels over
    // SSE, so it must play through the request-driven audio path.
    await act(async () => {
      pushServerTurn?.({
        id: "nudge-1",
        text: "Take your time — I'm here whenever you're ready.",
        type: "CLARIFICATION",
      });
    });
    expect(
      await screen.findByText("Take your time — I'm here whenever you're ready."),
    ).toBeTruthy();

    const [nudge] = queuedTurns();
    expect(nudge).toMatchObject({ interviewId: "interview-1", turnId: "nudge-1" });

    // While listening normally the microphone reaches the agent.
    const listeningFrames = forwardedMicFrames(socket);
    await act(async () => {
      sendMicFrame();
    });
    expect(forwardedMicFrames(socket)).toBe(listeningFrames + 1);

    // Playback (and its acknowledgement) is owned by the audio queue: the
    // component follows the reported lifecycle.
    await act(async () => {
      nudge?.onPlay?.();
    });
    await waitFor(() => expect(states.at(-1)).toBe("SPEAKING"));

    // The nudge is audible in the room, so capture pauses until it finishes:
    // the gateway must never transcribe the interviewer's own voice.
    await act(async () => {
      sendMicFrame();
    });
    expect(forwardedMicFrames(socket)).toBe(listeningFrames + 1);

    await act(async () => {
      nudge?.onEnded?.("LISTENING");
    });
    await waitFor(() => expect(states.at(-1)).toBe("LISTENING"));
    await act(async () => {
      sendMicFrame();
    });
    expect(forwardedMicFrames(socket)).toBe(listeningFrames + 2);

    // A replayed event for the same nudge turn must not queue or caption it twice.
    await act(async () => {
      pushServerTurn?.({
        id: "nudge-1",
        text: "Take your time — I'm here whenever you're ready.",
        type: "CLARIFICATION",
      });
    });
    expect(queuedTurns()).toHaveLength(1);
    expect(screen.getAllByText("Take your time — I'm here whenever you're ready.")).toHaveLength(1);
  });

  it("lets the candidate barge in locally while server-pushed audio plays", async () => {
    let pushServerTurn: ((turn: { id: string; text: string; type?: string }) => void) | null = null;
    const { socket, states } = await startAgentSession({
      onServerAiTurn: (handler) => {
        pushServerTurn = handler;
      },
    });

    await act(async () => {
      pushServerTurn?.({
        id: "nudge-2",
        text: "Take your time — I'm here whenever you're ready.",
        type: "CLARIFICATION",
      });
    });
    const [nudge] = queuedTurns();
    await act(async () => {
      nudge?.onPlay?.();
    });
    await waitFor(() => expect(states.at(-1)).toBe("SPEAKING"));

    // The gateway cannot hear the candidate while capture is muted, so a single
    // loud block is only treated as noise, not an interruption.
    await act(async () => {
      sendMicFrame();
      sendMicFrame();
    });
    expect(states.at(-1)).toBe("SPEAKING");
    expect(audioQueue.cancelAll).not.toHaveBeenCalled();

    // Sustained local speech takes the floor back: playback is cancelled, the
    // conversation listens again, and the interrupted turn is acknowledged.
    await act(async () => {
      sendMicFrame();
    });
    await waitFor(() => expect(states.at(-1)).toBe("LISTENING"));
    expect(audioQueue.cancelAll).toHaveBeenCalled();
    await waitFor(() =>
      expect(playbackAcks().some((call) => call.path.endsWith("nudge-2/playback-completed"))).toBe(
        true,
      ),
    );

    // Capture resumes: the candidate's words reach the agent again.
    const before = forwardedMicFrames(socket);
    await act(async () => {
      sendMicFrame();
    });
    expect(forwardedMicFrames(socket)).toBe(before + 1);
  });

  it("gives up after the reconnect ceiling and falls back to typed answers", async () => {
    const { socket, states } = await startAgentSession();
    await deliverTurn(socket, { id: "turn-8", text: "Why did you choose Postgres?" });
    await act(async () => {
      finishScheduledAudio();
    });
    await waitFor(() => expect(playbackAcks()).toHaveLength(1));

    // Two drops are recoverable: each one opens a fresh gateway socket.
    await act(async () => {
      socket.close();
    });
    await waitFor(() => expect(states.at(-1)).toBe("RECONNECTING"));
    const second = await waitForSocket(2);

    await act(async () => {
      second.close();
    });
    await waitFor(() => expect(states.at(-1)).toBe("RECONNECTING"));
    const third = await waitForSocket(3);
    expect(apiCalls.filter((call) => call.path.endsWith("/voice-token"))).toHaveLength(3);

    // The third drop exhausts the retry ceiling: an explicit error instead of
    // another silent reconnect, plus the text-mode escape hatch.
    await act(async () => {
      third.close();
    });
    await waitFor(() => expect(states.at(-1)).toBe("ERROR"));
    expect(
      screen.getByText("You can continue this interview by typing, or try voice again later."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Continue in Text Mode/ }));
    const input = await screen.findByLabelText("Type your answer");
    fireEvent.change(input, { target: { value: "Sharding on tenant id." } });
    fireEvent.click(screen.getByRole("button", { name: /Send Answer/ }));

    await waitFor(() =>
      expect(apiCalls.some((call) => call.path.endsWith("/conversation/transcripts"))).toBe(true),
    );
    await waitFor(() => expect(playbackAcks().at(-1)?.path).toContain("turn-9"));
  });

  it("treats candidate speech during agent playback as a barge-in", async () => {
    const { socket, states } = await startAgentSession();

    await deliverTurn(socket, { id: "turn-5", text: "Explain your caching layer." });
    expect(states.at(-1)).toBe("SPEAKING");
    expect(scheduledSources.length).toBeGreaterThan(0);
    expect(playbackAcks()).toHaveLength(0);

    await act(async () => {
      socket.deliver({ type: "user-speech-started" });
    });

    // Playback stops immediately — the UI listens again without waiting for the
    // scheduled PCM to finish — and the interrupted turn is still acknowledged
    // so the server-side state machine settles.
    expect(states.at(-1)).toBe("LISTENING");
    expect(scheduledSources.every((source) => stoppedSources.includes(source))).toBe(true);
    await waitFor(() => expect(playbackAcks()).toHaveLength(1));
    expect(playbackAcks()[0]?.path).toBe(
      "/api/v1/interviews/interview-1/conversation/turns/turn-5/playback-completed",
    );
  });

  it("stops scheduled interviewer audio when the candidate starts speaking", async () => {
    const { socket, states } = await startAgentSession();
    const before = states.length;

    await deliverTurn(socket, { id: "turn-4", text: "Walk me through your last project." });
    expect(scheduledSources.length).toBeGreaterThan(0);

    await act(async () => {
      socket.deliver({ type: "user-speech-started" });
    });
    // The interruption cancels playback, which resolves `whenIdle()`; the turn
    // is still acknowledged so the server-side state machine can settle.
    await waitFor(() => expect(playbackAcks()).toHaveLength(1));
    expect(states.length).toBeGreaterThan(before);
  });
});
