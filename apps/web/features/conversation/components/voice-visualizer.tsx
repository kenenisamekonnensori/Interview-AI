"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2, Brain, LoaderCircle, AlertTriangle } from "lucide-react";
import type { VoiceSessionState } from "./microphone";

export interface VisualizerStateParams {
  scale: number;
  rotationVelocity: number;
  radialDisplacement: number;
}

export function calculateVisualizerParams(
  state: VoiceSessionState,
  volume = 0,
  timeMs = 0,
): VisualizerStateParams {
  const normalizedVolume = Math.max(0, Math.min(1, volume));

  switch (state) {
    case "SPEAKING": {
      // Dynamic amplitude reactivity responding directly to the agent's synthesized voice energy
      // (scaling up to 1.35 based on volume)
      const scale = 1.0 + normalizedVolume * 0.35;
      const rotationVelocity = 1.5 + normalizedVolume * 0.5;
      const radialDisplacement = 1.0 + normalizedVolume * 0.35;
      return { scale, rotationVelocity, radialDisplacement };
    }
    case "THINKING": {
      // Concentrated orbital particle swirl:
      // higher rotation velocity than LISTENING, reduced radial displacement
      const scale = 1.0;
      const rotationVelocity = 2.5; // higher rotation velocity than LISTENING (1.0)
      const radialDisplacement = 0.5; // reduced radial displacement compared to LISTENING (1.0)
      return { scale, rotationVelocity, radialDisplacement };
    }
    case "LISTENING": {
      // Gentle idle breathing oscillation (base scale 1.0, subtle periodic pulse)
      // When candidate speaks, volume provides gentle responsiveness
      const pulse = timeMs > 0 ? Math.sin(timeMs / 1000) * 0.03 : 0;
      const speechReact = normalizedVolume * 0.15;
      const scale = 1.0 + pulse + speechReact;
      const rotationVelocity = 1.0;
      const radialDisplacement = 1.0;
      return { scale, rotationVelocity, radialDisplacement };
    }
    default: {
      return { scale: 1.0, rotationVelocity: 0.5, radialDisplacement: 0.8 };
    }
  }
}

export interface VoiceVisualizerProps {
  stream?: MediaStream | null;
  volume?: number;
  state: VoiceSessionState;
  errorMessage?: string | null;
  partialTranscript?: string;
  onRetry?: () => void;
}

export function VoiceVisualizer({
  stream,
  volume,
  state,
  errorMessage,
  partialTranscript,
  onRetry,
}: VoiceVisualizerProps) {
  const [streamAmplitude, setStreamAmplitude] = useState<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Set up Web Audio API Analyser Node on stream only if volume is not provided directly
  useEffect(() => {
    if (typeof volume === "number") {
      setStreamAmplitude(0);
      return;
    }

    if (!stream || state === "IDLE" || state === "ERROR" || state === "SPEAKING") {
      setStreamAmplitude(0);
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]!;
        }
        const average = sum / dataArray.length;
        // Normalize 0 to 1
        const normalized = Math.min(1, Math.max(0, average / 128));
        setStreamAmplitude(normalized);

        animFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
    } catch {
      setStreamAmplitude(0);
    }

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        void audioCtxRef.current.close();
      }
      audioCtxRef.current = null;
      analyserRef.current = null;
    };
  }, [stream, state, volume]);

  const effectiveAmplitude =
    typeof volume === "number" ? Math.max(0, Math.min(1, volume)) : streamAmplitude;

  const animParams = calculateVisualizerParams(state, effectiveAmplitude, Date.now());

  // Visualizer configuration based on current session state
  const isListening = state === "LISTENING";
  const isThinking = state === "THINKING";
  const isSpeaking = state === "SPEAKING";
  const isConnecting = state === "CONNECTING" || state === "RECONNECTING";
  const isError = state === "ERROR";

  const getStatusBadge = () => {
    if (isConnecting) {
      return {
        icon: <LoaderCircle className="size-4 animate-spin text-amber-400" />,
        label: state === "RECONNECTING" ? "Reconnecting connection…" : "Connecting microphone…",
        bg: "border-amber-500/20 bg-amber-500/10 text-amber-300",
      };
    }
    if (isListening) {
      return {
        icon: <Mic className="size-4 text-emerald-400 animate-pulse" />,
        label: effectiveAmplitude > 0.15 ? "Listening to you…" : "Listening — speak your response",
        bg: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
      };
    }
    if (isThinking) {
      return {
        icon: <Brain className="size-4 text-indigo-400 animate-pulse" />,
        label: "AI is analyzing your answer…",
        bg: "border-indigo-500/20 bg-indigo-500/10 text-indigo-300",
      };
    }
    if (isSpeaking) {
      return {
        icon: <Volume2 className="size-4 text-violet-400 animate-bounce" />,
        label: "Interviewer is speaking…",
        bg: "border-violet-500/20 bg-violet-500/10 text-violet-300",
      };
    }
    if (isError) {
      return {
        icon: <AlertTriangle className="size-4 text-rose-400" />,
        label: "Voice connection error",
        bg: "border-rose-500/20 bg-rose-500/10 text-rose-300",
      };
    }
    return {
      icon: <MicOff className="size-4 text-slate-400" />,
      label: "Microphone off",
      bg: "border-slate-800 bg-slate-900/60 text-slate-400",
    };
  };

  const status = getStatusBadge();

  return (
    <div
      className="relative flex flex-col items-center justify-center py-6 px-4"
      data-testid="voice-visualizer-container"
      data-state={state}
      data-scale={animParams.scale.toFixed(3)}
      data-rotation={animParams.rotationVelocity.toFixed(2)}
      data-displacement={animParams.radialDisplacement.toFixed(2)}
    >
      {/* Central Visualizer Stage */}
      <div className="relative flex items-center justify-center size-48 sm:size-56">
        {/* Outer Glow Pulse Rings */}
        <div
          className={`absolute inset-0 rounded-full transition-all duration-300 ${
            isSpeaking
              ? "bg-violet-500/20 animate-ping opacity-75 blur-xl"
              : isListening && effectiveAmplitude > 0.1
                ? "bg-emerald-500/25 blur-xl"
                : isThinking
                  ? "bg-indigo-500/20 animate-pulse blur-lg"
                  : "bg-transparent"
          }`}
          style={{
            transform: `scale(${animParams.scale})`,
          }}
        />

        {/* Middle Reactive Orb Ring */}
        <div
          className={`relative z-10 grid size-36 sm:size-40 place-items-center rounded-full border transition-all duration-300 ${
            isSpeaking
              ? "border-violet-400/50 bg-gradient-to-br from-violet-900/40 to-indigo-950/60 shadow-[0_0_40px_rgba(139,92,246,0.35)]"
              : isListening
                ? effectiveAmplitude > 0.15
                  ? "border-emerald-400/60 bg-gradient-to-br from-emerald-950/40 to-teal-950/60 shadow-[0_0_40px_rgba(16,185,129,0.35)]"
                  : "border-emerald-500/30 bg-slate-950/80 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                : isThinking
                  ? "border-indigo-400/50 bg-gradient-to-br from-indigo-950/50 to-slate-950/80 shadow-[0_0_30px_rgba(99,102,241,0.25)]"
                  : isError
                    ? "border-rose-500/40 bg-rose-950/20 shadow-[0_0_20px_rgba(244,63,94,0.2)]"
                    : "border-slate-800 bg-slate-950/60"
          }`}
          style={{
            transform: `scale(${1.0 + (animParams.scale - 1.0) * 0.5})`,
          }}
        >
          {/* Animated Equalizer Waveform Bars / Reactive Representation */}
          <div className="flex items-center gap-1.5 h-16 px-4">
            {[0.4, 0.7, 1.0, 0.6, 0.9, 0.5, 0.8, 0.4].map((scaleFactor, i) => {
              let barHeight = 12;

              if (isListening) {
                barHeight = Math.max(
                  12,
                  effectiveAmplitude * 64 * scaleFactor + (i % 2 === 0 ? 8 : 4),
                );
              } else if (isSpeaking) {
                barHeight =
                  16 +
                  effectiveAmplitude * 40 * scaleFactor +
                  Math.sin(Date.now() / 150 + i) * 12;
              } else if (isThinking) {
                // Orbital Swirl Motion
                barHeight = 14 + Math.sin(Date.now() / 150 + i * 1.2) * 10;
              }

              return (
                <div
                  key={i}
                  className={`w-1.5 rounded-full transition-all duration-75 ${
                    isSpeaking
                      ? "bg-gradient-to-t from-violet-500 to-indigo-300"
                      : isListening
                        ? effectiveAmplitude > 0.1
                          ? "bg-gradient-to-t from-emerald-500 to-teal-200"
                          : "bg-emerald-500/60"
                        : isThinking
                          ? "bg-indigo-400/60"
                          : "bg-slate-700"
                  }`}
                  style={{ height: `${Math.max(4, barHeight)}px` }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Live Status Badge */}
      <div className="mt-4 flex flex-col items-center gap-2">
        <span
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-medium backdrop-blur-md transition-all ${status.bg}`}
        >
          {status.icon}
          {status.label}
        </span>

        {/* Realtime Live Speech Captions */}
        {isListening && partialTranscript ? (
          <p className="mt-2 text-center text-sm font-medium text-emerald-300/90 italic animate-fadeIn max-w-lg">
            "{partialTranscript}…"
          </p>
        ) : null}

        {/* Error Detail & Quick Action */}
        {isError && errorMessage ? (
          <div className="mt-3 flex flex-col items-center gap-2 text-center">
            <p className="text-xs text-rose-300/90 max-w-sm">{errorMessage}</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="mt-1 text-xs font-medium text-rose-300 underline hover:text-rose-200"
              >
                Try reconnecting microphone
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
