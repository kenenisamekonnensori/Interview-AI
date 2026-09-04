"use client";

import { DeepgramClient } from "@deepgram/sdk";
import {
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
import { canSubmitTypedAnswer } from "@/features/conversation/typed-mode";
import {
  isSupportedVoiceLanguage,
  SUPPORTED_VOICE_LANGUAGES,
} from "@/features/conversation/voice-languages";
import { VoiceVisualizer } from "./voice-visualizer";
import { audioQueue } from "./audio-queue";
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
  channel?: { alternatives?: Array<{ transcript?: string }> };
  is_final?: boolean;
};

type LiveConnection = {
  close: () => void;
  connect: () => void;
  waitForOpen: () => Promise<unknown>;
  socket: { send: (data: Blob) => void };
  on: (event: string, callback: (value?: unknown) => void) => void;
};

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

  const connectionRef = useRef<LiveConnection | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const sessionRef = useRef(0);
  const reconnectAttemptsRef = useRef(0);
  const finalizingRef = useRef(false);
  const speakingNotifiedRef = useRef(false);
  const recoveryRef = useRef<AiResponseRecovery | null>(null);
  const displayedAiTurnIdsRef = useRef(new Set<string>());
  const latestAiTurnRef = useRef<string | null>(null);
  const restoredVersionRef = useRef("");
  const stateRef = useRef<VoiceSessionState>("IDLE");
  const sessionStartedRef = useRef(false);
  const pendingAnswerRef = useRef<string | null>(null);
  const pendingFlushAttemptsRef = useRef(0);
  const pendingFlushTimerRef = useRef<number | null>(null);
  const flushInFlightRef = useRef(false);
  const responsePendingRef = useRef(false);

  const active = state !== "IDLE" && state !== "ERROR";

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

  function cleanupSession() {
    sessionRef.current += 1;
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    audioQueue.cancelAll();
    recorderRef.current?.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    connectionRef.current?.close();
    connectionRef.current = null;
    finalizingRef.current = false;
    speakingNotifiedRef.current = false;
    updateRecovery(null);
    setTypingMode(false);
    setRestoredSpeakingTurnId(null);
    clearPendingAnswer();
    displayedAiTurnIdsRef.current.clear();
    latestAiTurnRef.current = null;
  }

  function stopVoiceTransport() {
    sessionRef.current += 1;
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    audioQueue.cancelAll();
    recorderRef.current?.stop();
    recorderRef.current = null;
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
    const types = ["audio/webm;codecs=opus", "audio/webm"];
    const mimeType = types.find((type) => MediaRecorder.isTypeSupported(type));
    return mimeType ? { mimeType } : undefined;
  }

  async function startVoice() {
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

      console.log("[Voice Pipeline] Initializing conversation session...");
      const conversation = await apiClient<ConversationStartResponse>(
        `/api/v1/interviews/${interviewId}/conversation/start`,
        { method: "POST" },
      );
      onStarted?.();

      const greeting = await resolvePendingAiTurn(conversation);
      if (greeting) appendAiTranscript(greeting.turn);

      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("[Voice Pipeline] Microphone stream acquired successfully.");

      await connectVoice(session);
      if (greeting) {
        await playAiTurn(greeting.turn.id, session);
      } else {
        updateState("LISTENING");
        void flushPendingAnswer();
      }
    } catch (cause) {
      stopVoiceTransport();
      setError(cause instanceof Error ? cause.message : "Could not start the microphone.");
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
    console.log("[Voice Pipeline] Requesting short-lived voice token...");
    const { accessToken } = await apiClient<{ accessToken: string }>(
      `/api/v1/interviews/${interviewId}/voice-token`,
      { method: "POST" },
    );
    if (session !== sessionRef.current) return;
    connectionRef.current?.close();

    const client = new DeepgramClient({ apiKey: accessToken });
    const connection = (await client.listen.v1.connect({
      model: "nova-3",
      language: interviewLanguage,
      punctuate: "true",
      interim_results: "true",
      smart_format: "true",
    })) as unknown as LiveConnection;

    connection.on("message", (message) => void handleTranscript(message, session));
    connection.on("error", () => scheduleReconnect(session));
    connection.on("close", () => scheduleReconnect(session));
    connection.connect();
    await connection.waitForOpen();

    if (session !== sessionRef.current) {
      connection.close();
      return;
    }
    connectionRef.current = connection;
    console.log("[Voice Pipeline] Deepgram WebSocket connected successfully.");

    if (!recorderRef.current && streamRef.current) {
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
    if (stateRef.current !== "SPEAKING" && stateRef.current !== "THINKING") {
      updateState("LISTENING");
    }
  }

  function scheduleReconnect(session: number) {
    if (session !== sessionRef.current || state === "IDLE" || state === "ERROR") return;
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

  async function notifySpeaking() {
    if (speakingNotifiedRef.current) return;
    speakingNotifiedRef.current = true;
    if (stateRef.current === "SPEAKING") {
      console.log("[Voice Pipeline] Candidate barge-in detected. Cancelling AI audio playback.");
      audioQueue.cancelAll();
      updateState("LISTENING");
    }
    await apiClient(`/api/v1/interviews/${interviewId}/conversation/speaking`, { method: "POST" });
  }

  async function handleTranscript(message: unknown, session: number) {
    if (disabled || session !== sessionRef.current || recoveryRef.current) return;
    const result = message as DeepgramResult;
    const text = result.channel?.alternatives?.[0]?.transcript?.trim();
    if (!text) return;
    try {
      await notifySpeaking();
      if (!result.is_final) {
        setPartialTranscript(text);
        return;
      }
      if (finalizingRef.current) {
        // A previous answer is still being submitted (POST + AI generation).
        // Capture this continuation instead of dropping it; the flush path
        // submits it once the interviewer is listening again.
        if (stateRef.current !== "CLOSING") {
          speakingNotifiedRef.current = false;
          setPartialTranscript("");
          bufferPendingAnswer(text);
        }
        return;
      }
      finalizingRef.current = true;
      speakingNotifiedRef.current = false;
      setPartialTranscript("");

      const currentState = stateRef.current;
      if (currentState === "CLOSING") {
        // The interviewer is closing; late words are not part of the transcript.
        finalizingRef.current = false;
        return;
      }
      if (
        currentState === "SPEAKING" ||
        currentState === "THINKING" ||
        currentState === "TRANSCRIBING"
      ) {
        // The interviewer is still speaking or thinking. Buffer the words so the
        // answer is never lost, and submit them once the interviewer is listening.
        bufferPendingAnswer(text);
        finalizingRef.current = false;
        return;
      }
      setTranscript((turns) => [...turns, `You: ${text}`]);
      updateState("TRANSCRIBING");
      updateState("THINKING");
      await submitAnswer(text, session);
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
    await apiClient(`/api/v1/interviews/${interviewId}/conversation/transcripts`, {
      method: "POST",
      body: { text } satisfies FinalizeTranscriptRequest,
    });
    await requestPendingResponse(session);
  }

  function bufferPendingAnswer(text: string) {
    const merged = pendingAnswerRef.current
      ? `${pendingAnswerRef.current} ${text}`.trim()
      : text;
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
      await apiClient<TranscriptResponse>(
        `/api/v1/interviews/${interviewId}/conversation/transcripts`,
        { method: "POST", body: { text } satisfies FinalizeTranscriptRequest },
      );
      clearPendingAnswer();
      // Append to the live transcript only once persisted so the local ordering
      // matches the server transcript (the pending question comes first).
      setTranscript((turns) => [...turns, `You: ${text}`]);
      updateState("THINKING");
      await requestPendingResponse(sessionRef.current);
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
      await apiClient(`/api/v1/interviews/${interviewId}/conversation/transcripts`, {
        method: "POST",
        body: { text } satisfies FinalizeTranscriptRequest,
      });
      await requestPendingResponse(sessionRef.current, true);
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
    if (displayedAiTurnIdsRef.current.has(turn.id)) return;
    displayedAiTurnIdsRef.current.add(turn.id);
    setTranscript((turns) => [...turns, `Interviewer: ${turn.text}`]);
  }

  async function playAiTurn(turnId: string, session: number) {
    audioQueue.enqueue({
      interviewId,
      turnId,
      onPlay: () => {
        if (session === sessionRef.current) updateState("SPEAKING");
      },
      onEnded: (ackState) => {
        if (session !== sessionRef.current) return;
        if (ackState === "COMPLETED" || ackState === "COMPLETING") {
          updateState("CLOSING");
          onInterviewCompleted?.();
          return;
        }
        updateState("LISTENING");
        void flushPendingAnswer();
      },
      onError: () => {
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
        onComplete={() => {
          setShowDiagnostic(false);
          void startVoice();
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
        <VoiceVisualizer
          stream={streamRef.current}
          state={state}
          errorMessage={error}
          partialTranscript={partialTranscript}
          onRetry={() => void startVoice()}
        />

        {/* Toolbar Controls */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 border-t border-white/10 pt-5">
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
