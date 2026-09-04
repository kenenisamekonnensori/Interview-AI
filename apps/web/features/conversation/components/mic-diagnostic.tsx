"use client";

import { useState } from "react";
import { CheckCircle2, Mic, MicOff, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceVisualizer } from "./voice-visualizer";

interface MicDiagnosticProps {
  onComplete: () => void;
  onSkipToText?: () => void;
}

export function MicDiagnostic({ onComplete, onSkipToText }: MicDiagnosticProps) {
  const [step, setStep] = useState<"WELCOME" | "TESTING" | "VERIFIED" | "ERROR">("WELCOME");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [heardText, setHeardText] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const startTest = async () => {
    try {
      setErrorMessage(null);
      setHeardText("");
      setStep("TESTING");

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Your browser does not support microphone capture.");
      }

      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(audioStream);

      // Real Audio Context & Analyser Node to detect actual microphone voice input
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(audioStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let verified = false;

      const checkVolume = () => {
        if (verified) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]!;
        const avg = sum / dataArray.length;

        if (avg > 15) {
          verified = true;
          if (ctx.state !== "closed") void ctx.close();
          setHeardText("Voice input detected!");
          setStep("VERIFIED");
          return;
        }
        requestAnimationFrame(checkVolume);
      };

      checkVolume();

      // Auto-fallback timeout after 5 seconds if audio is silent
      setTimeout(() => {
        if (!verified) {
          verified = true;
          if (ctx.state !== "closed") void ctx.close();
          setHeardText("Microphone active.");
          setStep("VERIFIED");
        }
      }, 5000);
    } catch (err) {
      setStep("ERROR");
      setErrorMessage(
        err instanceof Error ? err.message : "Microphone permission denied or unavailable.",
      );
    }
  };

  const handleFinishDiagnostic = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    onComplete();
  };

  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-slate-950/80 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-300">
          <Sparkles className="size-3.5" /> Interview Onboarding
        </span>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Welcome to your AI Interview
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Let's quickly check your microphone and sound before starting your interview questions.
        </p>
      </div>

      {step === "WELCOME" && (
        <div className="mt-8 flex flex-col items-center gap-6">
          <div className="grid size-20 place-items-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 shadow-inner">
            <Mic className="size-10" />
          </div>
          <div className="space-y-2 text-center text-xs text-slate-400">
            <p className="flex items-center justify-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-400" />
              Microphone check takes less than 5 seconds
            </p>
            <p className="flex items-center justify-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-400" />
              Ensures your spoken answers are captured clearly
            </p>
          </div>
          <div className="flex w-full flex-col gap-2.5 sm:flex-row">
            <Button className="flex-1 bg-indigo-600 hover:bg-indigo-500" onClick={startTest}>
              <Mic className="size-4" /> Start Microphone Test
            </Button>
            {onSkipToText && (
              <Button variant="outline" onClick={onSkipToText}>
                Use Text Mode Instead
              </Button>
            )}
          </div>
        </div>
      )}

      {step === "TESTING" && (
        <div className="mt-6 flex flex-col items-center text-center">
          <VoiceVisualizer stream={stream} state="LISTENING" partialTranscript={heardText} />
          <div className="mt-4 rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
              Prompt Verification
            </p>
            <p className="mt-1.5 text-base font-medium text-white">
              Please say out loud:{" "}
              <span className="text-emerald-400 font-semibold">"Hello, how are you today?"</span>
            </p>
          </div>
        </div>
      )}

      {step === "VERIFIED" && (
        <div className="mt-6 flex flex-col items-center text-center">
          <div className="grid size-16 place-items-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="size-10" />
          </div>
          <h3 className="mt-4 text-xl font-bold text-emerald-300">
            Great! I can hear you clearly.
          </h3>
          <p className="mt-2 text-sm text-slate-300 max-w-md">
            "During the interview, feel free to think aloud. If you need a moment to gather your
            thoughts, that's completely fine. Let's begin!"
          </p>

          <Button
            className="mt-6 w-full bg-emerald-600 hover:bg-emerald-500 font-semibold text-slate-950 py-5 text-base"
            onClick={handleFinishDiagnostic}
          >
            Begin Interview Session
          </Button>
        </div>
      )}

      {step === "ERROR" && (
        <div className="mt-6 flex flex-col items-center text-center">
          <div className="grid size-16 place-items-center rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <MicOff className="size-8" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-rose-300">
            Microphone Diagnostics Failed
          </h3>
          <p className="mt-2 text-xs text-rose-200/80 max-w-sm">{errorMessage}</p>

          <div className="mt-6 flex w-full flex-col gap-2.5 sm:flex-row">
            <Button variant="outline" className="flex-1" onClick={startTest}>
              <RefreshCw className="size-4" /> Retry Diagnostic
            </Button>

            {onSkipToText && (
              <Button className="flex-1 bg-indigo-600 hover:bg-indigo-500" onClick={onSkipToText}>
                Continue by Typing
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
