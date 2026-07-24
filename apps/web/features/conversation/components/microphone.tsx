"use client";

import { DeepgramClient } from "@deepgram/sdk";
import { Mic, MicOff } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { webEnvironment } from "@/lib/env";

type DeepgramResult = {
  type?: string;
  channel?: { alternatives?: Array<{ transcript?: string }> };
  is_final?: boolean;
};

export function InterviewMicrophone({ interviewId }: { interviewId: string }) {
  const [active, setActive] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const connectionRef = useRef<{ disconnect: () => void } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  async function start() {
    try {
      setError(null);
      setStatus("Connecting microphone…");
      const { accessToken } = await apiClient<{ accessToken: string }>(
        `/api/v1/interviews/${interviewId}/voice-token`,
        { method: "POST" },
      );
      await apiClient(`/api/v1/interviews/${interviewId}/conversation/start`, { method: "POST" });
      const client = new DeepgramClient({ accessToken });
      const connection = await client.listen.v1.connect({
        model: "nova-3",
        language: "en",
        punctuate: "true",
        interim_results: "true",
        smart_format: "true",
      });
      connection.on("message", async (message: unknown) => {
        const result = message as DeepgramResult;
        const text = result.channel?.alternatives?.[0]?.transcript?.trim();
        if (!text) return;
        if (audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
          setStatus("Listening — interviewer interrupted");
        }
        setTranscript(text);
        if (result.is_final) {
          setStatus("Interviewer is thinking…");
          await apiClient(`/api/v1/interviews/${interviewId}/conversation/turns`, {
            method: "POST",
            body: { speaker: "USER", type: "ANSWER", text, state: "THINKING" },
          });
          const next = await apiClient<{ turn: { id: string } }>(
            `/api/v1/interviews/${interviewId}/conversation/next-response`,
            { method: "POST" },
          );
          const response = await fetch(
            `${webEnvironment.NEXT_PUBLIC_API_URL}/api/v1/interviews/${interviewId}/conversation/turns/${next.turn.id}/audio`,
            { credentials: "include" },
          );
          if (response.ok) {
            const url = URL.createObjectURL(await response.blob());
            audioRef.current?.pause();
            audioRef.current = new Audio(url);
            audioRef.current.onplay = () => setStatus("Interviewer is speaking…");
            audioRef.current.onended = () => setStatus("Listening");
            await audioRef.current.play();
          }
        }
      });
      connection.on("error", () => {
        setError("Voice connection disconnected. Stop and start the microphone to reconnect.");
        setStatus("Disconnected");
      });
      connection.connect();
      await connection.waitForOpen();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorder.ondataavailable = (event) => {
        if (event.data.size) connection.socket.send(event.data);
      };
      recorder.start(250);
      connectionRef.current = connection;
      recorderRef.current = recorder;
      setActive(true);
      setStatus("Listening");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the microphone.");
      setStatus("Ready");
    }
  }
  function stop() {
    audioRef.current?.pause();
    recorderRef.current?.stop();
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    connectionRef.current?.disconnect();
    setActive(false);
    setStatus("Ready");
  }
  return (
    <div className="rounded-xl border border-border p-4">
      <Button onClick={active ? stop : start}>
        <>
          {active ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          {active ? "Stop microphone" : "Start microphone"}
        </>
      </Button>
      <p className="mt-3 text-sm text-muted-foreground">{status}</p>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      {transcript ? <p className="mt-3 text-sm text-muted-foreground">{transcript}</p> : null}
    </div>
  );
}
