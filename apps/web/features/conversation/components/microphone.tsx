"use client";

import { DeepgramClient } from "@deepgram/sdk";
import { LoaderCircle, Mic, MicOff, RotateCw, Volume2 } from "lucide-react";
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

export type VoiceSessionState =
  | "IDLE"
  | "CONNECTING"
  | "LISTENING"
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

const reconnectLimit = 2;

export function InterviewMicrophone({
  interviewId,
  disabled = false,
  onStarted,
  onSessionStateChange,
  onEndInterview,
  onResponseRecovered,
  onModeChange,
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
  const connectionRef = useRef<LiveConnection | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const sessionRef = useRef(0);
  const reconnectAttemptsRef = useRef(0);
  const finalizingRef = useRef(false);
  const speakingNotifiedRef = useRef(false);
  const playbackVersionRef = useRef(0);
  const recoveryRef = useRef<AiResponseRecovery | null>(null);
  const displayedAiTurnIdsRef = useRef(new Set<string>());
  const latestAiTurnRef = useRef<string | null>(null);
  const restoredVersionRef = useRef("");

  const active = state !== "IDLE" && state !== "ERROR";
  function updateState(next: VoiceSessionState) {
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

  useEffect(() => () => cleanupSession(), []);

  useEffect(() => {
    if (disabled) stopVoiceTransport();
  }, [disabled]);

  useEffect(() => {
    if (!restoredConversation) return;
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
    // A restored page has no live microphone transport yet. Start safely in text mode until
    // the user explicitly reconnects voice.
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

  function clearAudio() {
    playbackVersionRef.current += 1;
    const audio = audioRef.current;
    if (audio) {
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.src = "";
    }
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
  }

  function cleanupSession() {
    sessionRef.current += 1;
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    clearAudio();
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
    displayedAiTurnIdsRef.current.clear();
    latestAiTurnRef.current = null;
  }

  function stopVoiceTransport() {
    sessionRef.current += 1;
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    clearAudio();
    recorderRef.current?.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    connectionRef.current?.close();
    connectionRef.current = null;
  }

  function assertBrowserSupport() {
    if (interviewLanguage !== "en") {
      throw new Error("Voice interviews currently support English. You can continue by typing.");
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
      if (state === "ERROR") cleanupSession();
      const session = sessionRef.current + 1;
      sessionRef.current = session;
      reconnectAttemptsRef.current = 0;
      setError(null);
      setVoiceFallback(null);
      updateMode("VOICE");
      setTypingMode(false);
      updateRecovery(null);
      updateState("CONNECTING");
      const conversation = await apiClient<ConversationStartResponse>(
        `/api/v1/interviews/${interviewId}/conversation/start`,
        { method: "POST" },
      );
      onStarted?.();
      const greeting = await resolvePendingAiTurn(conversation);
      if (greeting) appendAiTranscript(greeting.turn);
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      await connectVoice(session);
      if (greeting) {
        await playAiTurn(greeting.turn.id, session);
      } else {
        updateState("LISTENING");
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
      const session = sessionRef.current + 1;
      sessionRef.current = session;
      updateMode("TEXT");
      setTypingMode(true);
      setError(null);
      setVoiceFallback(null);
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
    await apiClient(
      `/api/v1/interviews/${interviewId}/conversation/turns/${turnId}/playback-completed`,
      { method: "POST" },
    );
    updateState("LISTENING");
  }

  async function switchToText() {
    if (disabled) return;
    stopVoiceTransport();
    updateMode("TEXT");
    setTypingMode(true);
    setVoiceFallback(null);
    setError(null);
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
      protocols: ["token", accessToken],
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
    if (!recorderRef.current && streamRef.current) {
      const recorder = new MediaRecorder(streamRef.current, recorderOptions());
      recorder.ondataavailable = (event) => {
        if (event.data.size && connectionRef.current) {
          const conn = connectionRef.current as unknown as { sendMedia?: (blob: Blob) => void; socket?: { send: (blob: Blob) => void } };
          if (typeof conn.sendMedia === "function") {
            conn.sendMedia(event.data);
          } else if (conn.socket?.send) {
            conn.socket.send(event.data);
          }
        }
      };
      recorder.start(250);
      recorderRef.current = recorder;
    }
    if (state !== "SPEAKING" && state !== "THINKING") updateState("LISTENING");
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
    await apiClient(`/api/v1/interviews/${interviewId}/conversation/speaking`, { method: "POST" });
  }

  async function interruptPlayback(session: number) {
    const audio = audioRef.current;
    const turnId = audio?.dataset.turnId;
    if (!audio || audio.paused || !turnId) return;
    clearAudio();
    if (session !== sessionRef.current) return;
    await apiClient(
      `/api/v1/interviews/${interviewId}/conversation/turns/${turnId}/playback-completed`,
      {
        method: "POST",
      },
    );
    updateState("LISTENING");
  }

  async function handleTranscript(message: unknown, session: number) {
    if (disabled || session !== sessionRef.current || recoveryRef.current) return;
    const result = message as DeepgramResult;
    const text = result.channel?.alternatives?.[0]?.transcript?.trim();
    if (!text) return;
    try {
      await notifySpeaking();
      await interruptPlayback(session);
      if (!result.is_final) {
        setPartialTranscript(text);
        return;
      }
      if (finalizingRef.current) return;
      finalizingRef.current = true;
      speakingNotifiedRef.current = false;
      setPartialTranscript("");
      setTranscript((turns) => [...turns, `You: ${text}`]);
      updateState("THINKING");
      await apiClient(`/api/v1/interviews/${interviewId}/conversation/transcripts`, {
        method: "POST",
        body: { text } satisfies FinalizeTranscriptRequest,
      });
      await requestPendingResponse(session);
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

  async function requestPendingResponse(session: number, continueByTyping = false) {
    if (disabled) return;
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
    const response = await fetch(
      `${webEnvironment.NEXT_PUBLIC_API_URL}/api/v1/interviews/${interviewId}/conversation/turns/${turnId}/audio`,
      { credentials: "include" },
    );
    if (!response.ok) {
      showPlaybackFallback(turnId);
      return;
    }
    if (session !== sessionRef.current) return;
    clearAudio();
    const version = playbackVersionRef.current;
    const url = URL.createObjectURL(await response.blob());
    audioUrlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.dataset.turnId = turnId;
    audio.onplay = () => {
      if (session === sessionRef.current && version === playbackVersionRef.current)
        updateState("SPEAKING");
    };
    audio.onended = () => {
      if (session !== sessionRef.current || version !== playbackVersionRef.current) return;
      clearAudio();
      void apiClient(
        `/api/v1/interviews/${interviewId}/conversation/turns/${turnId}/playback-completed`,
        { method: "POST" },
      )
        .then(() => updateState("LISTENING"))
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : "Could not update interview playback.");
          updateState("ERROR");
        });
    };
    audio.onerror = () => {
      if (session === sessionRef.current) showPlaybackFallback(turnId);
    };
    try {
      await audio.play();
    } catch {
      showPlaybackFallback(turnId);
    }
  }

  function showPlaybackFallback(turnId: string) {
    latestAiTurnRef.current = turnId;
    clearAudio();
    setTypingMode(false);
    updateMode("TEXT");
    setError(
      "Audio playback is unavailable. The interviewer’s question is shown in the transcript.",
    );
    setVoiceFallback("Continue to acknowledge the question and type your answer.");
    updateState("SPEAKING");
  }

  function stop() {
    if (!active) return;
    cleanupSession();
    setPartialTranscript("");
    updateState("IDLE");
  }

  const status = {
    IDLE: "Microphone ready",
    CONNECTING: "Connecting microphone…",
    LISTENING: "Listening",
    THINKING: "Interviewer is thinking…",
    SPEAKING: "Interviewer is speaking…",
    CLOSING: "Closing the interview…",
    RECONNECTING: "Reconnecting voice…",
    ERROR: "Voice needs attention",
  }[state];

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={mode === "VOICE" && active ? stop : () => void startVoice()}
          disabled={disabled || state === "CONNECTING"}
        >
          {state === "CONNECTING" || state === "RECONNECTING" ? (
            <Mic className="size-4" />
          ) : active ? (
            <MicOff className="size-4" />
          ) : (
            <Mic className="size-4" />
          )}
          {state === "CONNECTING"
            ? "Connecting…"
            : mode === "VOICE" && active
              ? "Stop microphone"
              : "Voice"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void switchToText()} disabled={disabled}>
          Type instead
        </Button>
        {state === "RECONNECTING" || state === "CONNECTING" ? (
          <LoaderCircle className="size-4 animate-spin text-primary" />
        ) : null}
        {state === "SPEAKING" ? <Volume2 className="size-4 text-primary" /> : null}
        {state === "ERROR" ? (
          <Button size="sm" variant="outline" onClick={() => void startVoice()} disabled={disabled}>
            <RotateCw className="size-3" />
            Reconnect
          </Button>
        ) : null}
      </div>
      <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
        {status}
      </p>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      {voiceFallback ? (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-sm text-muted-foreground">{voiceFallback}</p>
          <Button className="mt-3" size="sm" onClick={() => void switchToText()}>
            Continue in text mode
          </Button>
        </div>
      ) : null}
      {restoredSpeakingTurnId && state === "SPEAKING" ? (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-sm text-muted-foreground">
            Session restored. The interviewer’s last question is shown in the transcript.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                setRestoredSpeakingTurnId(null);
                void playAiTurn(restoredSpeakingTurnId, sessionRef.current);
              }}
            >
              Replay audio
            </Button>
            <Button size="sm" variant="outline" onClick={() => void switchToText()}>
              Continue
            </Button>
          </div>
        </div>
      ) : null}
      {recovery ? (
        <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/[.07] p-4">
          <p className="text-sm font-medium text-foreground">Your answer was saved.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            We could not generate the next question right now. You can safely try again, switch to
            typing, or finish this interview and get feedback.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void requestPendingResponse(sessionRef.current)}>
              Try again
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void requestPendingResponse(sessionRef.current, true)}
            >
              Continue by typing
            </Button>
            <Button size="sm" variant="ghost" onClick={onEndInterview}>
              End interview and get feedback
            </Button>
          </div>
        </div>
      ) : null}
      {typingMode && state === "LISTENING" ? (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submitTypedAnswer();
          }}
        >
          <input
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={typedAnswer}
            onChange={(event) => setTypedAnswer(event.target.value)}
            placeholder="Type your answer"
            aria-label="Type your answer"
          />
          <Button type="submit" size="sm" disabled={!canSubmitTypedAnswer(state, typedAnswer)}>
            Send
          </Button>
        </form>
      ) : null}
      {captionsEnabled && partialTranscript ? (
        <p className="mt-3 text-sm italic text-muted-foreground">Listening: {partialTranscript}</p>
      ) : null}
      {captionsEnabled && transcript.length ? (
        <div
          className="mt-4 max-h-64 space-y-2 overflow-y-auto rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground"
          aria-live="polite"
          aria-label="Interview transcript"
        >
          {transcript.map((turn, index) => (
            <p key={`${index}-${turn}`}>{turn}</p>
          ))}
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
