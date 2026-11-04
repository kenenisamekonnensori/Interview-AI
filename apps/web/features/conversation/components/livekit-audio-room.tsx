"use client";

import React from "react";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";

export const audioTrackConstraints: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48000,
};

export type LiveKitAudioRoomProps = {
  interviewId: string;
  token: string;
  serverUrl: string;
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (error: Error) => void;
  children: React.ReactNode;
};

export function LiveKitAudioRoom({
  interviewId: _interviewId,
  token,
  serverUrl,
  onConnected,
  onDisconnected,
  onError,
  children,
}: LiveKitAudioRoomProps) {
  return (
    <LiveKitRoom
      audio={audioTrackConstraints}
      video={false}
      connect={true}
      serverUrl={serverUrl}
      token={token}
      onConnected={onConnected}
      onDisconnected={onDisconnected}
      onError={onError}
      data-testid="livekit-audio-room"
    >
      <RoomAudioRenderer />
      {children}
    </LiveKitRoom>
  );
}
