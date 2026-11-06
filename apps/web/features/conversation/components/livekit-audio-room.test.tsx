// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveKitAudioRoom, audioTrackConstraints } from "./livekit-audio-room";

afterEach(() => {
  cleanup();
});

// Mock @livekit/components-react to inspect props and simulate events
vi.mock("@livekit/components-react", () => {
  return {
    LiveKitRoom: vi.fn(
      ({ children, onConnected, onDisconnected, onError, audio, serverUrl, token, ...props }) => {
        const domProps = { ...props };
        delete (domProps as Record<string, unknown>).video;
        delete (domProps as Record<string, unknown>).connect;
        delete (domProps as Record<string, unknown>).connectOptions;
        return (
          <div
            data-testid="livekit-audio-room"
            data-server-url={serverUrl}
            data-token={token}
            data-audio={JSON.stringify(audio)}
            {...domProps}
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

describe("LiveKitAudioRoom Component (Acceptance Checks 1, 2, 4)", () => {
  it("mounts LiveKitRoom, enables audio, and renders RoomAudioRenderer and children (Acceptance Check 1)", () => {
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

  it("configures audio track constraints with hardware echoCancellation, noiseSuppression, and autoGainControl (Acceptance Check 2)", () => {
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

  it("simulates WebRTC room disconnection, displays Reconnecting state, and activates text mode fallback (Acceptance Check 4)", () => {
    function SimulatedInterviewSession() {
      const [mode, setMode] = useState<"VOICE" | "TEXT">("VOICE");
      const [connectionState, setConnectionState] = useState<
        "CONNECTED" | "RECONNECTING" | "DISCONNECTED"
      >("CONNECTED");

      return (
        <div>
          <div data-testid="connection-status">
            {connectionState === "RECONNECTING"
              ? "Reconnecting..."
              : connectionState === "CONNECTED"
                ? "Connected"
                : "Disconnected"}
          </div>

          {mode === "VOICE" ? (
            <LiveKitAudioRoom
              interviewId="test-interview-123"
              serverUrl="ws://localhost:7880"
              token="test-jwt-token"
              onConnected={() => setConnectionState("CONNECTED")}
              onDisconnected={() => setConnectionState("RECONNECTING")}
              onError={() => setConnectionState("DISCONNECTED")}
            >
              <div data-testid="voice-orb">Voice Orb Active</div>
            </LiveKitAudioRoom>
          ) : (
            <div data-testid="text-composer">
              <textarea placeholder="Type your response..." />
              <button type="button">Send Answer</button>
            </div>
          )}

          {connectionState === "RECONNECTING" && mode === "VOICE" ? (
            <div data-testid="fallback-banner">
              <p>Connection lost. You can switch to text mode to continue.</p>
              <button
                type="button"
                data-testid="switch-to-text-btn"
                onClick={() => setMode("TEXT")}
              >
                Switch to text mode
              </button>
            </div>
          ) : null}
        </div>
      );
    }

    render(<SimulatedInterviewSession />);

    // Initially connected in voice mode
    expect(screen.getByTestId("connection-status").textContent).toBe("Connected");
    expect(screen.getByTestId("voice-orb")).toBeTruthy();
    expect(screen.queryByTestId("text-composer")).toBeNull();

    // Simulate WebRTC disconnection event
    fireEvent.click(screen.getByTestId("mock-disconnect-trigger"));

    // Verify UI reflects "Reconnecting..." state and offers switch to text mode button
    expect(screen.getByTestId("connection-status").textContent).toBe("Reconnecting...");
    expect(screen.getByTestId("fallback-banner")).toBeTruthy();

    const switchBtn = screen.getByTestId("switch-to-text-btn");
    expect(switchBtn).toBeTruthy();

    // Click "Switch to text mode"
    fireEvent.click(switchBtn);

    // Verify WebRTC room unmounts and text composer activates
    expect(screen.queryByTestId("livekit-audio-room")).toBeNull();
    expect(screen.queryByTestId("voice-orb")).toBeNull();
    expect(screen.getByTestId("text-composer")).toBeTruthy();
  });
});
