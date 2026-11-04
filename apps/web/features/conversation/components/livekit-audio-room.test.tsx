// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  LiveKitAudioRoom,
  audioTrackConstraints,
} from "./livekit-audio-room";

// Mock @livekit/components-react to inspect props and simulate events
vi.mock("@livekit/components-react", () => {
  return {
    LiveKitRoom: vi.fn(
      ({
        children,
        onConnected,
        onDisconnected,
        onError,
        audio,
        serverUrl,
        token,
        video: _video,
        connect: _connect,
        ...props
      }) => {
        return (
          <div
            data-testid="livekit-audio-room"
            data-server-url={serverUrl}
            data-token={token}
            data-audio={JSON.stringify(audio)}
            {...props}
          >
            <button
              type="button"
              data-testid="mock-connect-trigger"
              onClick={() => onConnected?.()}
            >
              Connect
            </button>
            <button
              type="button"
              data-testid="mock-disconnect-trigger"
              onClick={() => onDisconnected?.()}
            >
              Disconnect
            </button>
            <button
              type="button"
              data-testid="mock-error-trigger"
              onClick={() => onError?.(new Error("Connection failed"))}
            >
              Error
            </button>
            {children}
          </div>
        );
      },
    ),
    RoomAudioRenderer: vi.fn(() => <div data-testid="room-audio-renderer-mock" />),
  };
});

describe("LiveKitAudioRoom Component", () => {
  it("mounts LiveKitRoom, enables audio, and renders RoomAudioRenderer and children", () => {
    const onConnected = vi.fn();
    const onDisconnected = vi.fn();
    const onError = vi.fn();

    render(
      <LiveKitAudioRoom
        interviewId="test-interview-123"
        serverUrl="ws://localhost:7880"
        token="test-jwt-token"
        onConnected={onConnected}
        onDisconnected={onDisconnected}
        onError={onError}
      >
        <span data-testid="room-child">Child Element</span>
      </LiveKitAudioRoom>,
    );

    expect(screen.getByTestId("livekit-audio-room")).toBeTruthy();
    expect(screen.getByTestId("room-audio-renderer-mock")).toBeTruthy();
    expect(screen.getByTestId("room-child").textContent).toBe("Child Element");

    // Simulate connection event
    screen.getByTestId("mock-connect-trigger").click();
    expect(onConnected).toHaveBeenCalledTimes(1);

    // Simulate disconnect event
    screen.getByTestId("mock-disconnect-trigger").click();
    expect(onDisconnected).toHaveBeenCalledTimes(1);

    // Simulate error event
    screen.getByTestId("mock-error-trigger").click();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("configures audio track constraints with hardware echoCancellation, noiseSuppression, and autoGainControl", () => {
    expect(audioTrackConstraints.echoCancellation).toBe(true);
    expect(audioTrackConstraints.noiseSuppression).toBe(true);
    expect(audioTrackConstraints.autoGainControl).toBe(true);
    expect(audioTrackConstraints.channelCount).toBe(1);
    expect(audioTrackConstraints.sampleRate).toBe(48000);

    const { container } = render(
      <LiveKitAudioRoom
        interviewId="test-interview-123"
        serverUrl="ws://localhost:7880"
        token="test-jwt-token"
        onConnected={vi.fn()}
        onDisconnected={vi.fn()}
        onError={vi.fn()}
      >
        <span>Content</span>
      </LiveKitAudioRoom>,
    );

    const roomElem = container.querySelector('[data-testid="livekit-audio-room"]');
    expect(roomElem).not.toBeNull();
    const passedAudio = JSON.parse(roomElem?.getAttribute("data-audio") ?? "{}");
    expect(passedAudio).toEqual(
      expect.objectContaining({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000,
      }),
    );
  });
});
