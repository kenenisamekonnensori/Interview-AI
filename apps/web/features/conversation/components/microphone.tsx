"use client";

import { DeepgramClient } from "@deepgram/sdk";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  LoaderCircle,
  Mic,
  MicOff,
  RotateCw,
  Volume2,
  MessageSquare,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  aiResponseRecoverySchema,
  type AiResponseRecovery,
  type ConversationState,
  type FinalizeTranscriptRequest,
  type LiveConversationSnapshot,
} from "@interviewer-ai/types";

import { Button } from "@/components/ui/button";
import { ApiError, apiClient } from "@/lib/api-client";
import { webEnvironment } from "@/lib/env";
import { canSubmitTypedAnswer } from "@/features/conversation/typed-mode";
import {
  isSupportedVoiceLanguage,
  SUPPORTED_VOICE_LANGUAGES,
} from "@/features/conversation/voice-languages";
import { VoiceVisualizer } from "./voice-visualizer";
import { audioQueue } from "./audio-queue";
import { AgentAudioPlayer, AgentMicCapture } from "../agent-voice";
import { MicDiagnostic } from "./mic-diagnostic";

export type VoiceSessionState =
  | "IDLE"
  | "CONNECTING"
  | "LISTENING"
  | "TRANSCRIBING"
  | "THINKING"
  | "SPEAKING"
  | "CLOSING"
  | "RECONNECTING"
  | "ERROR";
export type InterviewMode = "VOICE" | "TEXT";

type DeepgramResult = {
  channel?: { alternatives?: Array<{ transcript?: string; confidence?: number }> };
  is_final?: boolean;
};

type LiveConnection = {
  close: () => void;
  connect?: () => void;
  waitForOpen?: () => Promise<unknown>;
  sendMedia?: (data: Blob) => void;
  socket?: { send: (data: Blob) => void };
  on: (event: string, callback: (value?: unknown) => void) => void;
};

function resolveWebSocketUrl(path: string): string {
  if (path.startsWith("ws://") || path.startsWith("wss://")) {
    return path;
  }
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path.replace(/^http/, "ws");
  }
  const base =
    webEnvironment.NEXT_PUBLIC_API_URL ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:4000");
  const wsBase = base.replace(/^http/, "ws");
  const cleanBase = wsBase.endsWith("/") ? wsBase.slice(0, -1) : wsBase;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

function formatMediaError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return "Microphone permission was denied. Please allow microphone access in your browser settings to continue.";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "No microphone was detected on your device. Please plug in a microphone or switch to text mode.";
      case "NotReadableError":
      case "TrackStartError":
        return "Your microphone is busy or locked by another application. Please close other apps using the mic and try again.";
      case "OverconstrainedError":
        return "Your microphone does not support the required audio settings.";
      case "SecurityError":
        return "Microphone access is blocked by your browser security policy.";
      default:
        return error.message || "Could not access your microphone.";
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Could not connect to microphone or voice service.";
}

function createBackendVoiceSocket(streamPath: string): LiveConnection {
  const wsUrl = resolveWebSocketUrl(streamPath);
  console.log(`[Voice Pipeline] Connecting backend voice WebSocket: ${wsUrl}`);
  const ws = new WebSocket(wsUrl);
  const handlers: Record<string, Array<(val?: unknown) => void>> = {};

  ws.onopen = () => {
    handlers["open"]?.forEach((fn) => fn());
  };
  ws.binaryType = "arraybuffer";
  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      handlers["binary"]?.forEach((fn) => fn(event.data));
      return;
    }
    if (event.data instanceof Blob) {
      void event.data.arrayBuffer().then((frame) => {
        handlers["binary"]?.forEach((fn) => fn(frame));
      });
      return;
    }
    try {
      const data = JSON.parse(event.data);
      handlers["message"]?.forEach((fn) => fn(data));
    } catch {
      // ignore non-json messages
    }
  };
  ws.onerror = (err) => {
    handlers["error"]?.forEach((fn) => fn(err));
  };
  ws.onclose = (event) => {
    handlers["close"]?.forEach((fn) => fn(event));
  };

  return {
    close: () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
    },
    connect: () => {},
    waitForOpen: () =>
      new Promise((resolve, reject) => {
        if (ws.readyState === WebSocket.OPEN) return resolve(true);

        const timeout = setTimeout(() => {
          reject(new Error("Voice connection timed out waiting for backend server response."));
        }, 10000);

        const onOpen = () => {
          clearTimeout(timeout);
          ws.removeEventListener("close", onClose);
          resolve(true);
        };
        const onError = () => {
          clearTimeout(timeout);
          ws.removeEventListener("open", onOpen);
          reject(new Error("Voice server WebSocket connection failed."));
        };
        const onClose = (e: CloseEvent) => {
          clearTimeout(timeout);
          ws.removeEventListener("open", onOpen);
          reject(
            new Error(
              `Voice server connection closed (${e.code}${e.reason ? `: ${e.reason}` : ""}).`,
            ),
          );
        };

        ws.addEventListener("open", onOpen, { once: true });
        ws.addEventListener("error", onError, { once: true });
        ws.addEventListener("close", onClose, { once: true });
      }),
    sendMedia: (blob: Blob) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(blob);
      }
    },
    socket: {
      send: (blob: Blob) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(blob);
        }
      },
    },
    on: (event: string, callback: (value?: unknown) => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(callback);
    },
  };
}

type GeneratedTurn = { turn: { id: string; text: string } };
type ConversationStartResponse = {
  conversation: { state: string };
  greeting: GeneratedTurn | null;
};
type TranscriptResponse = {
  turn: { id: string; text: string };
  state: string;
};

const reconnectLimit = 2;
/** When a final transcript arrives while the interviewer is busy, keep retrying the submit for a bounded time. */
const pendingFlushMaxAttempts = 10;
const pendingFlushIntervalMs = 2_000;
/** No barge-in decision may be made this soon after AI playback starts: the TTS lead-in is the loudest echo spike. */
const bargeInGraceMs = 1_000;
/** Barge-in requires Deepgram itself to be confident this is real speech, not noise or leaked echo. */
const minimumBargeInConfidence = 0.8;
/** Minimum recognized text for a barge-in decision. */
const minimumBargeInCharacters = 3;
/** A noisy ceiling: conspiracy of false positives cannot cancel playback more than this per turn. */
const maximumBargeInsPerTurn = 3;
/** After a real barge-in, ignore finals for a moment: the trailing echo of the cancelled audio is already in flight. */
const echoSuppressionMs = 1_500;
/** Local VAD while request-driven audio plays: RMS gate (0..1) for candidate speech. */
const localBargeInRmsThreshold = 0.02;
/** Consecutive loud capture blocks before a local barge-in is accepted (~250 ms at 4096 samples). */
const localBargeInFrames = 3;

export function InterviewMicrophone({
  interviewId,
  disabled = false,
  onStarted,
  onSessionStateChange,
  onEndInterview,
  onResponseRecovered,
  onModeChange,
  onInterviewCompleted,
  restoredConversation,
  interviewLanguage = "en",
  captionsEnabled = true,
  onServerAiTurn,
}: {
  interviewId: string;
  disabled?: boolean;
  onStarted?: () => void;
  onSessionStateChange?: (state: VoiceSessionState) => void;
  onEndInterview?: () => void;
  onResponseRecovered?: () => void;
  onModeChange?: (mode: InterviewMode) => void;
  /** Invoked when the server reports the interview completed (e.g. closing turn acknowledged). */
  onInterviewCompleted?: () => void;
  restoredConversation?: LiveConversationSnapshot | null;
  interviewLanguage?: string;
  captionsEnabled?: boolean;
  /**
   * Registers a handler for AI turns pushed by the realtime stream (e.g. the
   * backend silence watchdog's canned re-engagement). The component owns
   * transcript display and playback for those turns.
   */
  /**
   * The page registers itself here once at mount: it passes a callback that the
   * microphone may call with `{ id, text, type }` for every AI turn the server
   * pushes over SSE (e.g. the backend silence watchdog's canned nudge), so the
   * pushed turn is played by the exact same request-driven code path.
   */
  onServerAiTurn?: (handler: (turn: { id: string; text: string; type?: string }) => void) => void;
}) {
  const [state, setState] = useState<VoiceSessionState>("IDLE");
  const [transcript, setTranscript] = useState<string[]>([]);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<AiResponseRecovery | null>(null);
  const [typingMode, setTypingMode] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [mode, setMode] = useState<InterviewMode>("VOICE");
  const [voiceFallback, setVoiceFallback] = useState<string | null>(null);
  const [restoredSpeakingTurnId, setRestoredSpeakingTurnId] = useState<string | null>(null);
  const [pendingAnswer, setPendingAnswer] = useState<string | null>(null);
  const [pendingFlushError, setPendingFlushError] = useState<string | null>(null);
  const [showDiagnostic, setShowDiagnostic] = useState<boolean>(true);
  const [activeSpeechBuffer, setActiveSpeechBuffer] = useState<string>("");
  const [cameraActive, setCameraActive] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const currentSpeechBufferRef = useRef<string>("");
  const silenceDebounceTimerRef = useRef<number | null>(null);

  const connectionRef = useRef<LiveConnection | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const sessionRef = useRef(0);
  const reconnectAttemptsRef = useRef(0);
  const finalizingRef = useRef(false);
  const speakingNotifiedRef = useRef(false);
  /** Start time of the AI playback currently in the SPEAKING state (0 = none). */
  const playbackStartedAtRef = useRef(0);
  /** Finalized transcripts are dropped until this instant (trailing echo after a cancel). */
  const echoSuppressedUntilRef = useRef(0);
  const bargeInCountRef = useRef(0);
  /** The text of the last AI turn: the recognizer must never hear this and act on it. */
  const latestAiTurnTextRef = useRef<string | null>(null);
  const recoveryRef = useRef<AiResponseRecovery | null>(null);
  const displayedAiTurnIdsRef = useRef(new Set<string>());
  const latestAiTurnRef = useRef<string | null>(null);
  /** Agent pipeline (server-owned gateway) state, set per session start. */
  const agentModeRef = useRef(false);
  const agentPlayerRef = useRef<AgentAudioPlayer | null>(null);
  const agentMicRef = useRef<AgentMicCapture | null>(null);
  const agentAudioDoneRef = useRef(false);
  const agentAudioTurnIdRef = useRef<string | null>(null);
  /** Capture pauses while request-driven audio plays so the agent never hears its own voice. */
  const agentMicMutedRef = useRef(false);
  /** Consecutive loud capture blocks observed while the capture is muted. */
  const localBargeInFramesRef = useRef(0);
  const restoredVersionRef = useRef("");
  const stateRef = useRef<VoiceSessionState>("IDLE");
  const sessionStartedRef = useRef(false);
  const pendingAnswerRef = useRef<string | null>(null);
  const pendingFlushAttemptsRef = useRef(0);
  const pendingFlushTimerRef = useRef<number | null>(null);
  const flushInFlightRef = useRef(false);
  const responsePendingRef = useRef(false);

  const active = state !== "IDLE" && state !== "ERROR";

  /** Current interaction mode for closures that must not resubscribe (SSE bridge). */
  const modeRef = useRef<InterviewMode>("VOICE");
  modeRef.current = mode;

  function updateState(next: VoiceSessionState) {
    console.log(`[Voice Pipeline] State transition -> ${next}`);
    stateRef.current = next;
    setState(next);
    onSessionStateChange?.(next);
  }

  function updateRecovery(next: AiResponseRecovery | null) {
    recoveryRef.current = next;
    setRecovery(next);
  }

  function updateMode(next: InterviewMode) {
    setMode(next);
    onModeChange?.(next);
  }

  function stopPendingFlushTimer() {
    if (pendingFlushTimerRef.current !== null) {
      window.clearInterval(pendingFlushTimerRef.current);
      pendingFlushTimerRef.current = null;
    }
  }

  function clearPendingAnswer() {
    stopPendingFlushTimer();
    pendingAnswerRef.current = null;
    pendingFlushAttemptsRef.current = 0;
    setPendingAnswer(null);
    setPendingFlushError(null);
  }

  useEffect(() => () => cleanupSession(), []);

  // Realtime bridge: AI turns pushed by the server (e.g. the backend silence
  // watchdog's canned nudge) are appended and played with the exact same code
  // path as request-driven turns, so there is no second playback model.
  const onServerAiTurnRef = useRef(onServerAiTurn);
  onServerAiTurnRef.current = onServerAiTurn;
  useEffect(() => {
    onServerAiTurnRef.current?.((turn: { id: string; text: string; type?: string }) => {
      if (!sessionStartedRef.current) return; // outside an active session, the page refetch shows the turn
      // The agent websocket delivers the gateway's own turns; the canned silence
      // nudge is the one server-pushed turn it does not own, so it still plays
      // through the request-driven audio path in agent mode.
      if (agentModeRef.current && turn.type !== "CLARIFICATION") return;
      if (displayedAiTurnIdsRef.current.has(turn.id)) return; // request-driven path already owns this turn
      appendAiTranscript(turn);
      if (modeRef.current === "TEXT") {
        // Playback is not part of typing mode; acknowledging the turn moves the
        // conversation back to LISTENING, mirroring the audio path's ack.
        void acknowledgeTextTurn(turn.id);
      } else {
        void playAiTurn(turn.id, sessionRef.current);
      }
    });
    // Registered once at mount; the closure only touches refs and stable setters.
  }, []);

  useEffect(() => {
    if (disabled) stopVoiceTransport();
  }, [disabled]);

  useEffect(() => {
    if (!restoredConversation) return;
    // A live session owns the UI; server refetches (e.g. realtime stream
    // invalidations) must never reset the microphone state mid-conversation.
    if (sessionStartedRef.current) return;
    const version = `${restoredConversation.id}:${restoredConversation.sequence}:${restoredConversation.state}`;
    if (restoredVersionRef.current === version) return;
    restoredVersionRef.current = version;
    const turns = restoredConversation.turns;
    setTranscript(
      turns.map((turn) => `${turn.speaker === "AI" ? "Interviewer" : "You"}: ${turn.text}`),
    );
    displayedAiTurnIdsRef.current = new Set(
      turns.filter((turn) => turn.speaker === "AI").map((turn) => turn.id),
    );
    const latestAiTurn = [...turns].reverse().find((turn) => turn.speaker === "AI");
    latestAiTurnRef.current = latestAiTurn?.id ?? null;
    latestAiTurnTextRef.current = latestAiTurn?.text ?? null;
    setShowDiagnostic(false);
    updateMode("TEXT");
    setTypingMode(restoredConversation.state === "LISTENING");
    setRestoredSpeakingTurnId(
      restoredConversation.state === "SPEAKING" ? (latestAiTurn?.id ?? null) : null,
    );
    updateState(voiceStateForConversation(restoredConversation.state));
    if (restoredConversation.state === "THINKING") {
      updateRecovery(restoredAiFailureRecovery);
    } else {
      updateRecovery(null);
    }
  }, [restoredConversation]);

  useEffect(() => {
    if (cameraActive) {
      navigator.mediaDevices
        ?.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        })
        .then((stream) => {
          videoStreamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch((err) => {
          console.warn("Camera preview not permitted or unavailable:", err);
          setCameraActive(false);
        });
    } else {
      videoStreamRef.current?.getTracks().forEach((track) => track.stop());
      videoStreamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
    return () => {
      videoStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraActive]);

  function resetPlaybackGuards() {
    playbackStartedAtRef.current = 0;
    echoSuppressedUntilRef.current = 0;
    bargeInCountRef.current = 0;
  }

  function cleanupSession() {
    sessionRef.current += 1;
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    if (silenceDebounceTimerRef.current !== null) {
      window.clearTimeout(silenceDebounceTimerRef.current);
      silenceDebounceTimerRef.current = null;
    }
    currentSpeechBufferRef.current = "";
    setActiveSpeechBuffer("");
    videoStreamRef.current?.getTracks().forEach((track) => track.stop());
    videoStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    audioQueue.cancelAll();
    recorderRef.current?.stop();
    recorderRef.current = null;
    agentMicRef.current?.stop();
    agentMicRef.current = null;
    agentPlayerRef.current?.dispose();
    agentPlayerRef.current = null;
    agentModeRef.current = false;
    agentAudioDoneRef.current = false;
    agentAudioTurnIdRef.current = null;
    agentMicMutedRef.current = false;
    localBargeInFramesRef.current = 0;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    connectionRef.current?.close();
    connectionRef.current = null;
    finalizingRef.current = false;
    speakingNotifiedRef.current = false;
    resetPlaybackGuards();
    updateRecovery(null);
    setTypingMode(false);
    setRestoredSpeakingTurnId(null);
    clearPendingAnswer();
    displayedAiTurnIdsRef.current.clear();
    latestAiTurnRef.current = null;
  }

  function stopVoiceTransport() {
    sessionRef.current += 1;
    resetPlaybackGuards();
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    audioQueue.cancelAll();
    recorderRef.current?.stop();
    recorderRef.current = null;
    agentMicRef.current?.stop();
    agentMicRef.current = null;
    agentPlayerRef.current?.dispose();
    agentPlayerRef.current = null;
    agentModeRef.current = false;
    agentAudioDoneRef.current = false;
    agentAudioTurnIdRef.current = null;
    agentMicMutedRef.current = false;
    localBargeInFramesRef.current = 0;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    connectionRef.current?.close();
    connectionRef.current = null;
  }

  function assertBrowserSupport() {
    if (!isSupportedVoiceLanguage(interviewLanguage)) {
      throw new Error(
        `Voice interviews are currently available in ${SUPPORTED_VOICE_LANGUAGES.join(", ")}. You can continue by typing.`,
      );
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      throw new Error(
        "Voice interviews require a secure browser with microphone and MediaRecorder support.",
      );
    }
  }

  function recorderOptions(): MediaRecorderOptions | undefined {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    const mimeType = types.find(
      (type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type),
    );
    return mimeType ? { mimeType } : undefined;
  }

  async function acquireMicrophoneStream(existingStream?: MediaStream): Promise<MediaStream> {
    if (
      existingStream &&
      existingStream.active &&
      existingStream.getAudioTracks().some((track) => track.readyState === "live")
    ) {
      console.log("[Voice Pipeline] Reusing verified diagnostic microphone stream.");
      return existingStream;
    }

    if (
      streamRef.current &&
      streamRef.current.active &&
      streamRef.current.getAudioTracks().some((track) => track.readyState === "live")
    ) {
      console.log("[Voice Pipeline] Reusing active microphone stream.");
      return streamRef.current;
    }

    console.log("[Voice Pipeline] Requesting microphone permission and stream...");
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  }

  async function startVoice(existingStream?: MediaStream) {
    if ((active && mode === "VOICE") || disabled) return;
    try {
      assertBrowserSupport();
      void audioQueue.unlockAudio();
      if (state === "ERROR") cleanupSession();
      sessionStartedRef.current = true;
      const session = sessionRef.current + 1;
      sessionRef.current = session;
      reconnectAttemptsRef.current = 0;
      setError(null);
      setVoiceFallback(null);
      updateMode("VOICE");
      setTypingMode(false);
      updateRecovery(null);
      setRestoredSpeakingTurnId(null);
      updateState("CONNECTING");

      // 1. Acquire microphone stream immediately (or reuse diagnostic stream)
      const stream = await acquireMicrophoneStream(existingStream);
      streamRef.current = stream;
      console.log("[Voice Pipeline] Microphone stream ready.");

      // 2. Fetch conversation start and voice connection token in parallel
      console.log(
        "[Voice Pipeline] Starting conversation and preparing voice transport in parallel...",
      );
      const conversationPromise = apiClient<ConversationStartResponse>(
        `/api/v1/interviews/${interviewId}/conversation/start`,
        { method: "POST" },
      );
      const voiceTokenPromise = apiClient<{
        accessToken?: string;
        streamPath?: string;
        pipeline?: "agent" | "legacy";
      }>(`/api/v1/interviews/${interviewId}/voice-token`, { method: "POST" });

      const [conversation, voiceData] = await Promise.all([conversationPromise, voiceTokenPromise]);
      onStarted?.();
      agentModeRef.current = voiceData.pipeline === "agent";

      if (session !== sessionRef.current) return;

      // Agent mode: the agent speaks the greeting over the websocket and the
      // gateway persists it; the legacy /next-response call would append a
      // duplicate greeting turn.
      const greetingPromise =
        voiceData.pipeline === "agent" ? Promise.resolve(null) : resolvePendingAiTurn(conversation);

      // 3. Connect voice transport concurrently with greeting synthesis/resolution
      await connectVoiceWithData(voiceData, session);

      const greeting = await greetingPromise;
      if (session !== sessionRef.current) return;

      if (greeting) {
        appendAiTranscript(greeting.turn);
        await playAiTurn(greeting.turn.id, session);
      } else {
        updateState("LISTENING");
        void flushPendingAnswer();
      }
    } catch (cause) {
      stopVoiceTransport();
      const message = formatMediaError(cause);
      console.error("[Voice Pipeline] Voice startup failed:", cause);
      setError(message);
      setVoiceFallback("Voice is unavailable. You can continue by typing.");
      updateState("ERROR");
    }
  }

  async function startText() {
    if (disabled) return;
    try {
      stopVoiceTransport();
      sessionStartedRef.current = true;
      const session = sessionRef.current + 1;
      sessionRef.current = session;
      updateMode("TEXT");
      setTypingMode(true);
      setError(null);
      setVoiceFallback(null);
      setRestoredSpeakingTurnId(null);
      updateState("CONNECTING");
      const conversation = await apiClient<ConversationStartResponse>(
        `/api/v1/interviews/${interviewId}/conversation/start`,
        { method: "POST" },
      );
      onStarted?.();
      const greeting = await resolvePendingAiTurn(conversation);
      if (greeting) {
        appendAiTranscript(greeting.turn);
        await acknowledgeTextTurn(greeting.turn.id);
      } else {
        updateState("LISTENING");
        void flushPendingAnswer();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start text mode.");
      updateState("ERROR");
    }
  }

  async function resolvePendingAiTurn(conversation: ConversationStartResponse) {
    if (conversation.greeting) return conversation.greeting;
    if (["GREETING", "SPEAKING"].includes(conversation.conversation.state)) {
      return apiClient<GeneratedTurn>(
        `/api/v1/interviews/${interviewId}/conversation/next-response`,
        {
          method: "POST",
        },
      );
    }
    return null;
  }

  async function acknowledgeAgentTurn(turnId: string) {
    if (agentAudioTurnIdRef.current !== turnId) return;
    agentAudioTurnIdRef.current = null;
    await acknowledgeTextTurn(turnId);
  }

  async function acknowledgeTextTurn(turnId: string) {
    const ack = await apiClient<{ state?: string }>(
      `/api/v1/interviews/${interviewId}/conversation/turns/${turnId}/playback-completed`,
      { method: "POST" },
    );
    if (ack.state === "COMPLETED" || ack.state === "COMPLETING") {
      updateState("CLOSING");
      onInterviewCompleted?.();
      return;
    }
    updateState("LISTENING");
    void flushPendingAnswer();
  }

  async function switchToText() {
    if (disabled) return;
    stopVoiceTransport();
    updateMode("TEXT");
    setTypingMode(true);
    setVoiceFallback(null);
    setError(null);
    setRestoredSpeakingTurnId(null);
    const turnId = latestAiTurnRef.current;
    if (!turnId) {
      if (state === "IDLE" || state === "ERROR") await startText();
      return;
    }
    try {
      await acknowledgeTextTurn(turnId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not continue in text mode.");
      updateState("ERROR");
    }
  }

  async function connectVoice(session: number) {
    console.log("[Voice Pipeline] Requesting voice connection credentials...");
    const voiceData = await apiClient<{
      accessToken?: string;
      streamPath?: string;
      pipeline?: "agent" | "legacy";
    }>(`/api/v1/interviews/${interviewId}/voice-token`, { method: "POST" });
    await connectVoiceWithData(voiceData, session);
  }

  async function connectVoiceWithData(
    voiceData: {
      accessToken?: string;
      streamPath?: string;
      pipeline?: "agent" | "legacy";
    },
    session: number,
  ) {
    if (session !== sessionRef.current) return;
    connectionRef.current?.close();

    // The server-owned agent gateway carries no browser-facing provider token;
    // streaming, transcripts, and playback all run over the backend socket.
    agentModeRef.current = voiceData.pipeline === "agent";

    let connection: LiveConnection;
    if (voiceData.accessToken) {
      try {
        const client = new DeepgramClient({ apiKey: voiceData.accessToken });
        connection = (await client.listen.v1.connect({
          model: "nova-3",
          language: interviewLanguage,
          punctuate: "true",
          interim_results: "true",
          smart_format: "true",
          endpointing: "500",
        })) as unknown as LiveConnection;
        connection.connect?.();
        await connection.waitForOpen?.();
        console.log("[Voice Pipeline] Connected directly to Deepgram WebSocket.");
      } catch (directErr) {
        console.warn(
          "[Voice Pipeline] Direct Deepgram connect failed, falling back to backend bridge:",
          directErr,
        );
        if (voiceData.streamPath) {
          connection = createBackendVoiceSocket(voiceData.streamPath);
          await connection.waitForOpen?.();
          console.log("[Voice Pipeline] Connected via backend WebSocket bridge.");
        } else {
          throw directErr;
        }
      }
    } else if (voiceData.streamPath) {
      console.log("[Voice Pipeline] Connecting via backend voice WebSocket bridge...");
      connection = createBackendVoiceSocket(voiceData.streamPath);
      await connection.waitForOpen?.();
      console.log("[Voice Pipeline] Backend voice WebSocket bridge connected successfully.");
    } else {
      throw new Error("Voice configuration is not available.");
    }

    connection.on("message", (message) => void handleTranscript(message, session));
    connection.on("error", () => scheduleReconnect(session));
    connection.on("close", () => scheduleReconnect(session));

    if (session !== sessionRef.current) {
      connection.close();
      return;
    }
    connectionRef.current = connection;

    if (agentModeRef.current) {
      const player = agentPlayerRef.current ?? new AgentAudioPlayer();
      agentPlayerRef.current = player;
      player.resume();
      connection.on("binary", (frame: unknown) => {
        if (session === sessionRef.current && frame instanceof ArrayBuffer) {
          player.push(frame);
        }
      });
      console.log("[Voice Pipeline] Agent playback sink ready (24 kHz PCM).");
    }

    if (!recorderRef.current && !agentMicRef.current && streamRef.current) {
      if (agentModeRef.current) {
        const capture = new AgentMicCapture(
          streamRef.current,
          async (chunk) => {
            // Drop frames while a request-driven turn is playing (e.g. the canned
            // silence nudge): the gateway would otherwise transcribe the nudge as
            // candidate speech.
            if (agentMicMutedRef.current) return;
            const conn = connectionRef.current as unknown as {
              socket?: { send: (data: ArrayBuffer) => void };
            } | null;
            conn?.socket?.send(chunk);
          },
          (level) => handleLocalAudioLevel(level, session),
        );
        agentMicRef.current = capture;
        console.log("[Voice Pipeline] Agent mic PCM capture active (16 kHz).");
      } else {
        const recorder = new MediaRecorder(streamRef.current, recorderOptions());
        recorder.ondataavailable = (event) => {
          if (event.data.size && connectionRef.current) {
            const conn = connectionRef.current as unknown as {
              sendMedia?: (blob: Blob) => void;
              socket?: { send: (blob: Blob) => void };
            };
            if (typeof conn.sendMedia === "function") {
              conn.sendMedia(event.data);
            } else if (conn.socket?.send) {
              conn.socket.send(event.data);
            }
          }
        };
        recorder.start(250);
        recorderRef.current = recorder;
        console.log("[Voice Pipeline] MediaRecorder active (250ms chunks).");
      }
    }
    if (stateRef.current !== "SPEAKING" && stateRef.current !== "THINKING") {
      updateState("LISTENING");
    }
  }

  function scheduleReconnect(session: number) {
    // Connection handlers outlive the render they were registered on: read the
    // live state, not the state captured when the socket was created.
    const liveState = stateRef.current;
    if (session !== sessionRef.current || liveState === "IDLE" || liveState === "ERROR") return;
    if (reconnectAttemptsRef.current >= reconnectLimit) {
      stopVoiceTransport();
      setError("Voice connection was lost.");
      setVoiceFallback("You can continue this interview by typing, or try voice again later.");
      updateState("ERROR");
      return;
    }
    reconnectAttemptsRef.current += 1;
    updateState("RECONNECTING");
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = window.setTimeout(() => {
      void connectVoice(session).catch(() => scheduleReconnect(session));
    }, 500 * reconnectAttemptsRef.current);
  }

  /**
   * While request-driven audio plays the microphone is muted to the gateway, so
   * the provider cannot detect an interruption: local voice activity is the
   * only way the candidate can take the floor back during that audio.
   */
  function handleLocalAudioLevel(level: number, session: number) {
    if (!agentMicMutedRef.current) {
      localBargeInFramesRef.current = 0;
      return;
    }
    if (level < localBargeInRmsThreshold) {
      localBargeInFramesRef.current = 0;
      return;
    }
    localBargeInFramesRef.current += 1;
    if (localBargeInFramesRef.current < localBargeInFrames) return;
    localBargeInFramesRef.current = 0;
    handleLocalBargeIn(session);
  }

  function handleLocalBargeIn(session: number) {
    if (session !== sessionRef.current || !agentMicMutedRef.current) return;
    console.log("[Voice Pipeline] Local barge-in detected: cancelling server-pushed audio.");
    agentMicMutedRef.current = false;
    audioQueue.cancelAll();
    updateState("LISTENING");
    const turnId = latestAiTurnRef.current;
    if (!turnId) return;
    // The cancelled turn still needs its acknowledgement: the server stays in
    // SPEAKING until playback-completed returns it to LISTENING.
    void acknowledgeTextTurn(turnId).catch((cause) => {
      console.warn("[Voice Pipeline] Barge-in acknowledgement failed.", cause);
    });
  }

  async function notifySpeaking() {
    if (speakingNotifiedRef.current) return;
    speakingNotifiedRef.current = true;
    if (stateRef.current === "SPEAKING") {
      console.log("[Voice Pipeline] Candidate barge-in detected. Cancelling AI audio playback.");
      // A genuine interruption: the cancelled audio's trailing echo is already
      // in the recognizer pipeline, so finals for the next moment are dropped.
      echoSuppressedUntilRef.current = Date.now() + echoSuppressionMs;
      playbackStartedAtRef.current = 0;
      audioQueue.cancelAll();
      updateState("LISTENING");
    }
    await apiClient(`/api/v1/interviews/${interviewId}/conversation/speaking`, { method: "POST" });
  }

  async function handleTranscript(message: unknown, session: number) {
    if (session !== sessionRef.current) return;

    // Agent pipeline messages (server-owned Deepgram Voice Agent gateway).
    // Deepgram legacy results carry no "type" field, so these branches are
    // unreachable on the legacy path.
    if (message && typeof message === "object" && "type" in message) {
      const agentMessage = message as {
        type: string;
        text?: string;
        message?: string;
        state?: string;
        turn?: { id: string; text: string } | null;
        turnId?: string;
      };
      switch (agentMessage.type) {
        case "agent-ready":
          console.log("[Voice Pipeline] Agent gateway ready (SettingsApplied).");
          agentPlayerRef.current?.resume();
          return;
        case "user-speech-started":
          // The provider detected interruption; the gateway already persists
          // the server-side state transition, so the client only updates UI.
          agentPlayerRef.current?.stop();
          if (stateRef.current === "SPEAKING") updateState("LISTENING");
          return;
        case "user-transcript":
          if (agentMessage.text && !disabled && !recoveryRef.current) {
            setPartialTranscript("");
            setTranscript((turns) => [...turns, `You: ${agentMessage.text}`]);
          }
          return;
        case "agent-turn": {
          const turn = agentMessage.turn;
          if (!turn || displayedAiTurnIdsRef.current.has(turn.id)) return;
          agentAudioTurnIdRef.current = turn.id;
          appendAiTranscript(turn);
          // The persisted turn's audio starts now: the interviewer is speaking,
          // so candidate speech from this point is a real interruption.
          if (agentMessage.state === "SPEAKING") updateState("SPEAKING");
          if (agentAudioDoneRef.current) {
            // AgentAudioDone only means the provider has sent all frames. The
            // client waits for scheduled PCM to finish for UI synchronization;
            // only then does it acknowledge the turn.
            await agentPlayerRef.current?.whenIdle();
            if (session !== sessionRef.current) return;
            try {
              await acknowledgeAgentTurn(turn.id);
            } catch (cause) {
              console.warn("[Voice Pipeline] Agent turn ack failed; resuming listening.", cause);
              updateState("LISTENING");
            }
            agentAudioDoneRef.current = false;
          }
          return;
        }
        case "agent-audio-done":
          agentAudioDoneRef.current = true;
          if (agentMessage.turnId) agentAudioTurnIdRef.current = agentMessage.turnId;
          void (async () => {
            await agentPlayerRef.current?.whenIdle();
            if (session !== sessionRef.current) return;
            const turnId = agentAudioTurnIdRef.current;
            if (!turnId) return;
            try {
              await acknowledgeAgentTurn(turnId);
            } catch (cause) {
              console.warn("[Voice Pipeline] Agent turn ack failed; resuming listening.", cause);
              updateState("LISTENING");
            } finally {
              agentAudioDoneRef.current = false;
            }
          })();
          return;
        case "agent-closing":
          updateState("CLOSING");
          return;
        case "error":
          console.error("[Voice Pipeline] Agent gateway error:", agentMessage.message);
          setError(agentMessage.message ?? "Voice connection problem.");
          return;
        case "warning":
          console.warn("[Voice Pipeline] Agent gateway warning:", agentMessage.message);
          return;
        default:
          break;
      }
    }

    if (disabled || recoveryRef.current) return;
    const result = message as DeepgramResult;
    const alternative = result.channel?.alternatives?.[0];
    const text = alternative?.transcript?.trim();
    if (!text) return;
    try {
      // Interim results are captions only: they are low-confidence, arrive for
      // every syllable, and can never drive a barge-in or state decision.
      if (!result.is_final) {
        setPartialTranscript(text);
        return;
      }
      setPartialTranscript("");

      const currentState = stateRef.current;
      if (currentState === "CLOSING") {
        return;
      }
      // Trailing echo of the audio just cancelled by a real barge-in is still
      // in flight; dropping it briefly prevents a cancel-of-the-cancel loop.
      if (Date.now() < echoSuppressedUntilRef.current) {
        return;
      }
      // The mic hears the interviewer's playback; never act on its transcript.
      if (isSelfEcho(text, latestAiTurnTextRef.current)) {
        return;
      }
      if (currentState === "SPEAKING") {
        // Barge-in must be real speech: confident, long enough, outside the
        // playback grace window, and within a per-turn ceiling so a noisy
        // microphone cannot spin a cancel loop.
        const confident = (alternative?.confidence ?? 0) >= minimumBargeInConfidence;
        const outsideGrace =
          playbackStartedAtRef.current === 0 ||
          Date.now() - playbackStartedAtRef.current >= bargeInGraceMs;
        const allowed =
          confident &&
          outsideGrace &&
          text.length >= minimumBargeInCharacters &&
          bargeInCountRef.current < maximumBargeInsPerTurn;
        if (!allowed) {
          return;
        }
        bargeInCountRef.current += 1;
      }
      await notifySpeaking();
      if (currentState === "THINKING" || currentState === "TRANSCRIBING" || finalizingRef.current) {
        // Buffer speech while the interviewer is busy so words are never lost
        bufferPendingAnswer(text);
        return;
      }

      // Append finalized fragment to continuous answer buffer
      const prev = currentSpeechBufferRef.current;
      const merged = prev ? `${prev} ${text}`.trim() : text;
      currentSpeechBufferRef.current = merged;
      setActiveSpeechBuffer(merged);

      // Debounce natural speech pause (700ms) before committing turn
      if (silenceDebounceTimerRef.current !== null) {
        window.clearTimeout(silenceDebounceTimerRef.current);
      }
      silenceDebounceTimerRef.current = window.setTimeout(() => {
        void commitVoiceAnswer(session);
      }, 700);
    } catch (cause) {
      console.error("[Voice Pipeline] Error handling transcript:", cause);
    }
  }

  /**
   * Commits the buffered voice answer after natural pause or when user clicks "Done Speaking".
   */
  async function commitVoiceAnswer(session: number) {
    if (silenceDebounceTimerRef.current !== null) {
      window.clearTimeout(silenceDebounceTimerRef.current);
      silenceDebounceTimerRef.current = null;
    }
    const fullText = currentSpeechBufferRef.current.trim();
    if (!fullText) return;
    currentSpeechBufferRef.current = "";
    setActiveSpeechBuffer("");
    setPartialTranscript("");

    if (finalizingRef.current || stateRef.current === "CLOSING") {
      bufferPendingAnswer(fullText);
      return;
    }
    finalizingRef.current = true;
    speakingNotifiedRef.current = false;
    setTranscript((turns) => [...turns, `You: ${fullText}`]);
    updateState("TRANSCRIBING");
    updateState("THINKING");
    try {
      await submitAnswer(fullText, session);
    } catch (cause) {
      if (session === sessionRef.current) {
        const nextRecovery = getAiResponseRecovery(cause);
        if (nextRecovery) {
          setError(null);
          updateRecovery(nextRecovery);
          updateState("THINKING");
          return;
        }
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not process this response. Please try again.",
        );
        updateState("ERROR");
      }
    } finally {
      finalizingRef.current = false;
    }
  }

  async function submitAnswer(text: string, session: number) {
    const result = await apiClient<TranscriptResponse & { nextResponse?: GeneratedTurn }>(
      `/api/v1/interviews/${interviewId}/conversation/transcripts`,
      {
        method: "POST",
        body: { text, respondImmediately: true } satisfies FinalizeTranscriptRequest,
      },
    );
    if (session !== sessionRef.current) return;
    if (result.nextResponse) {
      updateRecovery(null);
      appendAiTranscript(result.nextResponse.turn);
      onResponseRecovered?.();
      await playAiTurn(result.nextResponse.turn.id, session);
    } else {
      await requestPendingResponse(session);
    }
  }

  function bufferPendingAnswer(text: string) {
    const merged = pendingAnswerRef.current ? `${pendingAnswerRef.current} ${text}`.trim() : text;
    pendingAnswerRef.current = merged;
    setPendingAnswer(merged);
    setPendingFlushError(null);
    schedulePendingFlush();
    console.log("[Voice Pipeline] Answer buffered while interviewer is busy:", text);
  }

  function schedulePendingFlush() {
    if (pendingFlushTimerRef.current !== null) return;
    pendingFlushTimerRef.current = window.setInterval(() => {
      void flushPendingAnswer();
    }, pendingFlushIntervalMs);
  }

  async function flushPendingAnswer() {
    const text = pendingAnswerRef.current;
    if (!text || flushInFlightRef.current || finalizingRef.current) return;
    if (disabled || stateRef.current === "CLOSING") {
      // The interview ended, expired, or is closing; buffered words cannot be submitted.
      clearPendingAnswer();
      return;
    }
    flushInFlightRef.current = true;
    try {
      const result = await apiClient<TranscriptResponse & { nextResponse?: GeneratedTurn }>(
        `/api/v1/interviews/${interviewId}/conversation/transcripts`,
        {
          method: "POST",
          body: { text, respondImmediately: true } satisfies FinalizeTranscriptRequest,
        },
      );
      clearPendingAnswer();
      // Append to the live transcript only once persisted so the local ordering
      // matches the server transcript (the pending question comes first).
      setTranscript((turns) => [...turns, `You: ${text}`]);
      if (result.nextResponse) {
        updateRecovery(null);
        appendAiTranscript(result.nextResponse.turn);
        onResponseRecovered?.();
        await playAiTurn(result.nextResponse.turn.id, sessionRef.current);
      } else {
        updateState("THINKING");
        await requestPendingResponse(sessionRef.current);
      }
    } catch {
      // Any failure (state conflict, invalid state, transient network) is retried
      // on the next tick or the playback end hook; give up gracefully after a
      // bounded number of attempts so a manual retry can take over.
      pendingFlushAttemptsRef.current += 1;
      if (pendingFlushAttemptsRef.current >= pendingFlushMaxAttempts) {
        stopPendingFlushTimer();
        setPendingFlushError(
          "We could not save your answer automatically. You can submit it below.",
        );
      }
    } finally {
      flushInFlightRef.current = false;
    }
  }

  async function requestPendingResponse(session: number, continueByTyping = false) {
    if (disabled || responsePendingRef.current) return;
    responsePendingRef.current = true;
    try {
      const next = await apiClient<GeneratedTurn>(
        `/api/v1/interviews/${interviewId}/conversation/next-response`,
        { method: "POST" },
      );
      if (session !== sessionRef.current) return;
      updateRecovery(null);
      appendAiTranscript(next.turn);
      onResponseRecovered?.();
      if (continueByTyping) {
        await acknowledgeTextTurn(next.turn.id);
        setTypingMode(true);
        return;
      }
      await playAiTurn(next.turn.id, session);
    } catch (cause) {
      const nextRecovery = getAiResponseRecovery(cause);
      if (nextRecovery) {
        setError(null);
        updateRecovery(nextRecovery);
        updateState("THINKING");
        return;
      }
      setError(cause instanceof Error ? cause.message : "Could not generate the next question.");
      updateState("ERROR");
    } finally {
      responsePendingRef.current = false;
    }
  }

  async function submitTypedAnswer() {
    if (disabled) return;
    const text = typedAnswer.trim();
    if (!canSubmitTypedAnswer(state, text, finalizingRef.current)) return;
    finalizingRef.current = true;
    setTypedAnswer("");
    setTranscript((turns) => [...turns, `You: ${text}`]);
    updateState("THINKING");
    try {
      const result = await apiClient<TranscriptResponse & { nextResponse?: GeneratedTurn }>(
        `/api/v1/interviews/${interviewId}/conversation/transcripts`,
        {
          method: "POST",
          body: { text, respondImmediately: true } satisfies FinalizeTranscriptRequest,
        },
      );
      if (result.nextResponse) {
        updateRecovery(null);
        appendAiTranscript(result.nextResponse.turn);
        onResponseRecovered?.();
        await acknowledgeTextTurn(result.nextResponse.turn.id);
        setTypingMode(true);
      } else {
        await requestPendingResponse(sessionRef.current, true);
      }
    } catch (cause) {
      const nextRecovery = getAiResponseRecovery(cause);
      if (nextRecovery) {
        updateRecovery(nextRecovery);
        updateState("THINKING");
      } else {
        setError(cause instanceof Error ? cause.message : "Could not save your typed response.");
        updateState("ERROR");
      }
    } finally {
      finalizingRef.current = false;
    }
  }

  function appendAiTranscript(turn: GeneratedTurn["turn"]) {
    latestAiTurnRef.current = turn.id;
    latestAiTurnTextRef.current = turn.text;
    if (displayedAiTurnIdsRef.current.has(turn.id)) return;
    displayedAiTurnIdsRef.current.add(turn.id);
    setTranscript((turns) => [...turns, `Interviewer: ${turn.text}`]);
  }

  async function playAiTurn(turnId: string, session: number) {
    audioQueue.enqueue({
      interviewId,
      turnId,
      onPlay: () => {
        if (session === sessionRef.current) {
          if (agentModeRef.current) agentMicMutedRef.current = true;
          speakingNotifiedRef.current = false;
          // A new AI turn starts a fresh barge-in accounting: record exactly
          // when playback began for the grace window and reset the ceiling.
          playbackStartedAtRef.current = Date.now();
          bargeInCountRef.current = 0;
          echoSuppressedUntilRef.current = 0;
          updateState("SPEAKING");
        }
      },
      onEnded: (ackState) => {
        agentMicMutedRef.current = false;
        if (session !== sessionRef.current) return;
        if (ackState === "COMPLETED" || ackState === "COMPLETING") {
          updateState("CLOSING");
          onInterviewCompleted?.();
          return;
        }
        updateState("LISTENING");
        void flushPendingAnswer();
      },
      onError: (err) => {
        console.warn(`[Voice Pipeline] Audio playback failed for turn ${turnId}:`, err);
        agentMicMutedRef.current = false;
        if (session === sessionRef.current) showPlaybackFallback(turnId);
      },
    });
  }

  function showPlaybackFallback(turnId: string) {
    latestAiTurnRef.current = turnId;
    audioQueue.cancelAll();
    updateMode("TEXT");
    setTypingMode(true);
    setError(
      "Audio playback is unavailable. The interviewer’s question is shown in the transcript.",
    );
    setVoiceFallback("Continue to acknowledge the question and type your answer.");
    // Acknowledge the turn server-side: moves SPEAKING→LISTENING for questions,
    // or completes the interview for a closing turn — never a dead end.
    void acknowledgeTextTurn(turnId).catch(() => undefined);
  }

  function stop() {
    if (!active) return;
    cleanupSession();
    sessionStartedRef.current = false;
    setPartialTranscript("");
    updateState("IDLE");
  }

  // Render Mic Onboarding Diagnostic Modal / Screen if first time opening
  if (showDiagnostic && !restoredConversation) {
    return (
      <MicDiagnostic
        onComplete={(diagnosticStream) => {
          setShowDiagnostic(false);
          void startVoice(diagnosticStream);
        }}
        onSkipToText={() => {
          setShowDiagnostic(false);
          void startText();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Resumed session: the interviewer had a question ready when the page reloaded */}
      {restoredSpeakingTurnId ? (
        <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-5 backdrop-blur-md">
          <p className="text-sm font-semibold text-indigo-200">
            Your interviewer has a question ready.
          </p>
          <p className="mt-1 text-xs text-indigo-300/80">
            The question is shown in the transcript below. You can hear it again or continue by
            typing.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Button
              size="sm"
              onClick={() => {
                setRestoredSpeakingTurnId(null);
                void startVoice();
              }}
            >
              <Volume2 className="size-4" /> Replay question (voice)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setRestoredSpeakingTurnId(null);
                void switchToText();
              }}
            >
              Continue by typing
            </Button>
          </div>
        </div>
      ) : null}

      {/* High-Impact Voice Visualizer Stage */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur-xl">
        {/* Optional Candidate Camera Preview for realistic studio practice */}
        {cameraActive ? (
          <div className="relative mb-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-inner">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-48 w-full object-cover scale-x-[-1] sm:h-56"
            />
            <div className="absolute bottom-2.5 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-md">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              Candidate Studio Camera Preview
            </div>
          </div>
        ) : null}

        <VoiceVisualizer
          stream={streamRef.current}
          state={state}
          errorMessage={error}
          partialTranscript={partialTranscript || activeSpeechBuffer}
          onRetry={() => void startVoice()}
        />

        {/* Live Ongoing Speech Buffer Feedback */}
        {activeSpeechBuffer ? (
          <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-center backdrop-blur-md animate-fadeIn">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Your ongoing response
            </p>
            <p className="mt-1 text-sm text-emerald-100">“{activeSpeechBuffer}”</p>
            <p className="mt-2 text-[11px] text-emerald-400/80">
              Take your time. Pause for 1.8s or click &ldquo;Done Speaking&rdquo; below when you are
              finished.
            </p>
          </div>
        ) : null}

        {/* Toolbar Controls */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3 border-t border-white/10 pt-5">
          {state === "LISTENING" && (activeSpeechBuffer || partialTranscript) ? (
            <Button
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-900/40 animate-pulse"
              onClick={() => void commitVoiceAnswer(sessionRef.current)}
            >
              <CheckCircle2 className="size-4" />
              Done Speaking (Submit Answer)
            </Button>
          ) : null}

          <Button
            size="lg"
            className={`font-semibold transition-all ${
              active && mode === "VOICE"
                ? "bg-rose-600 hover:bg-rose-500 text-white"
                : "bg-indigo-600 hover:bg-indigo-500 text-white"
            }`}
            onClick={mode === "VOICE" && active ? stop : () => void startVoice()}
            disabled={disabled || state === "CONNECTING"}
          >
            {state === "CONNECTING" || state === "RECONNECTING" ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : active ? (
              <MicOff className="size-4" />
            ) : (
              <Mic className="size-4" />
            )}
            {state === "CONNECTING"
              ? "Connecting…"
              : mode === "VOICE" && active
                ? "Turn Off Microphone"
                : "Start Voice Session"}
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
            onClick={() => setCameraActive((prev) => !prev)}
          >
            {cameraActive ? (
              <CameraOff className="size-4 text-rose-400" />
            ) : (
              <Camera className="size-4 text-indigo-400" />
            )}
            {cameraActive ? "Hide Camera" : "Preview Camera"}
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
            onClick={() => void switchToText()}
            disabled={disabled}
          >
            <MessageSquare className="size-4" />
            Type Instead
          </Button>

          {state === "ERROR" ? (
            <Button
              size="lg"
              variant="outline"
              onClick={() => void startVoice()}
              disabled={disabled}
            >
              <RotateCw className="size-4" />
              Reconnect
            </Button>
          ) : null}
        </div>
      </div>

      {/* Fallback Banner */}
      {voiceFallback ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 backdrop-blur-md">
          <p className="text-sm text-amber-200">{voiceFallback}</p>
          <Button
            className="mt-3 bg-amber-500 text-slate-950 hover:bg-amber-400 font-medium"
            size="sm"
            onClick={() => void switchToText()}
          >
            Continue in Text Mode
          </Button>
        </div>
      ) : null}

      {/* Buffered answer notice: words captured while the interviewer was busy */}
      {pendingAnswer ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 backdrop-blur-md">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-200">
            <LoaderCircle className="size-4 animate-spin" />
            Answer captured — submitting it as soon as the interviewer finishes speaking.
          </p>
          <p className="mt-1 text-xs text-emerald-300/80">“{truncateText(pendingAnswer, 160)}”</p>
          {pendingFlushError ? (
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <p className="text-xs text-amber-300/90">{pendingFlushError}</p>
              <Button size="sm" onClick={() => void flushPendingAnswer()}>
                Retry submitting
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Recovery Helper */}
      {recovery ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 backdrop-blur-md">
          <p className="text-sm font-semibold text-amber-200">Your response was saved safely.</p>
          <p className="mt-1 text-xs text-amber-300/80">
            We could not generate the next question immediately. You can retry, switch to typing, or
            complete the interview.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Button size="sm" onClick={() => void requestPendingResponse(sessionRef.current)}>
              Retry Generating Question
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void requestPendingResponse(sessionRef.current, true)}
            >
              Continue by Typing
            </Button>
            <Button size="sm" variant="ghost" onClick={onEndInterview}>
              Finish & Get Report
            </Button>
          </div>
        </div>
      ) : null}

      {/* Typed Input Form */}
      {typingMode && state === "LISTENING" ? (
        <form
          className="flex gap-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            void submitTypedAnswer();
          }}
        >
          <input
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={typedAnswer}
            onChange={(event) => setTypedAnswer(event.target.value)}
            placeholder="Type your thoughtful answer here…"
            aria-label="Type your answer"
          />
          <Button
            type="submit"
            size="lg"
            className="bg-indigo-600 hover:bg-indigo-500"
            disabled={!canSubmitTypedAnswer(state, typedAnswer)}
          >
            Send Answer
          </Button>
        </form>
      ) : null}

      {/* Live Conversation Transcript */}
      {captionsEnabled && transcript.length ? (
        <div
          className="max-h-72 space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/40 p-4 backdrop-blur-md"
          aria-live="polite"
          aria-label="Interview transcript"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-white/10 pb-2">
            Live Interview Transcript
          </p>
          {transcript.map((turn, index) => {
            const isUser = turn.startsWith("You:");
            return (
              <div
                key={`${index}-${turn}`}
                className={`flex gap-3 text-sm ${
                  isUser ? "text-emerald-300/90" : "text-indigo-200/90"
                }`}
              >
                <span className="font-semibold select-none">
                  {isUser ? "You:" : "Interviewer:"}
                </span>
                <span className="flex-1 text-slate-200">
                  {turn.replace(/^(You|Interviewer):\s*/, "")}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Normalizes text into lowercase word tokens for the echo-overlap check.
 */
function normalizeWords(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Echo defense: the microphone hears the interviewer's own playback through the
 * speakers, so Deepgram transcribes the AI turn itself. A transcript that is
 * mostly words from the last AI turn is self-echo — it must never trigger
 * barge-in or become the candidate's answer.
 */
function isSelfEcho(candidate: string, aiTurnText: string | null) {
  if (!aiTurnText) return false;
  const candidateWords = normalizeWords(candidate);
  if (candidateWords.length < 2) return false;
  const aiWords = new Set(normalizeWords(aiTurnText));
  const overlap = candidateWords.filter((word) => aiWords.has(word)).length;
  return overlap / candidateWords.length >= 0.6;
}

function getAiResponseRecovery(cause: unknown): AiResponseRecovery | null {
  if (!(cause instanceof ApiError) || cause.code !== "AI_RESPONSE_FAILED") return null;
  const recovery = cause.details?.recovery;
  const parsed = aiResponseRecoverySchema.safeParse(recovery);
  return parsed.success ? parsed.data : null;
}

const restoredAiFailureRecovery: AiResponseRecovery = {
  transcriptSaved: true,
  conversationState: "THINKING",
  retryable: true,
  actions: { retry: true, continueByTyping: true, endInterview: true },
};

function voiceStateForConversation(state: ConversationState): VoiceSessionState {
  if (state === "LISTENING") return "LISTENING";
  if (state === "THINKING" || state === "TRANSCRIBING") return "THINKING";
  if (state === "SPEAKING" || state === "GREETING") return "SPEAKING";
  if (state === "CLOSING" || state === "COMPLETED") return "CLOSING";
  return "IDLE";
}

function truncateText(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}
