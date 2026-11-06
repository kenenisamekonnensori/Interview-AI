"use client";

import React from "react";
import { Track } from "livekit-client";
import { useMaybeRoomContext, useTracks, useTrackVolume } from "@livekit/components-react";

import { VoiceVisualizer } from "./voice-visualizer";
import type { VoiceSessionState } from "./microphone";

export type LiveKitVisualizerAdapterProps = {
  state: VoiceSessionState;
  errorMessage?: string | null | undefined;
  partialTranscript?: string | undefined;
  onRetry?: (() => void) | undefined;
};

export function LiveKitVisualizerAdapter(props: LiveKitVisualizerAdapterProps) {
  const room = useMaybeRoomContext();

  if (!room) {
    return <VoiceVisualizer {...props} volume={0} />;
  }

  return <ConnectedLiveKitVisualizer {...props} />;
}

function ConnectedLiveKitVisualizer({
  state,
  errorMessage,
  partialTranscript,
  onRetry,
}: LiveKitVisualizerAdapterProps) {
  const tracks = useTracks([Track.Source.Microphone]);

  const localTrackRef = tracks.find((tr) => tr.participant.isLocal);
  const remoteTrackRef = tracks.find((tr) => !tr.participant.isLocal);

  const localVolume = useTrackVolume(localTrackRef);
  const remoteVolume = useTrackVolume(remoteTrackRef);

  // In SPEAKING state, reactivity comes directly from agent's synthesized voice energy.
  // In LISTENING state, candidate speech volume is reflected.
  // In THINKING / IDLE states, volume is 0 so animation is driven by state formulas.
  const effectiveVolume =
    state === "SPEAKING" ? remoteVolume : state === "LISTENING" ? localVolume : 0;

  return (
    <VoiceVisualizer
      state={state}
      volume={effectiveVolume}
      errorMessage={errorMessage}
      partialTranscript={partialTranscript}
      onRetry={onRetry}
    />
  );
}
