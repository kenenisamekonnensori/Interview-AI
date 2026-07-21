"use client";

import { DeepgramClient } from "@deepgram/sdk";
import { Mic, MicOff } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";

type DeepgramResult = { type?: string; channel?: { alternatives?: Array<{ transcript?: string }> }; is_final?: boolean };

export function InterviewMicrophone({ interviewId }: { interviewId: string }) {
  const [active, setActive] = useState(false); const [transcript, setTranscript] = useState("");
  const connectionRef = useRef<{ disconnect: () => void } | null>(null); const recorderRef = useRef<MediaRecorder | null>(null);
  async function start() {
    const { accessToken } = await apiClient<{ accessToken: string }>(`/api/v1/interviews/${interviewId}/voice-token`, { method: "POST" });
    await apiClient(`/api/v1/interviews/${interviewId}/conversation/start`, { method: "POST" });
    const client = new DeepgramClient({ accessToken }); const connection = await client.listen.v1.connect({ model: "nova-3", language: "en", punctuate: "true", interim_results: "true", smart_format: "true" });
    connection.on("message", async (message: unknown) => { const result = message as DeepgramResult; const text = result.channel?.alternatives?.[0]?.transcript?.trim(); if (!text) return; setTranscript(text); if (result.is_final) await apiClient(`/api/v1/interviews/${interviewId}/conversation/turns`, { method: "POST", body: { speaker: "USER", type: "ANSWER", text, state: "THINKING" } }); });
    connection.connect(); await connection.waitForOpen(); const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" }); recorder.ondataavailable = (event) => { if (event.data.size) connection.socket.send(event.data); }; recorder.start(250); connectionRef.current = connection; recorderRef.current = recorder; setActive(true);
  }
  function stop() { recorderRef.current?.stop(); recorderRef.current?.stream.getTracks().forEach((track) => track.stop()); connectionRef.current?.disconnect(); setActive(false); }
  return <div className="rounded-xl border border-border p-4"><Button onClick={active ? stop : start}><>{active ? <MicOff className="size-4" /> : <Mic className="size-4" />}{active ? "Stop microphone" : "Start microphone"}</></Button>{transcript ? <p className="mt-3 text-sm text-muted-foreground">{transcript}</p> : null}</div>;
}
