// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { VoiceVisualizer, calculateVisualizerParams } from "./voice-visualizer";

afterEach(() => {
  cleanup();
});

describe("Voice Visualizer State Mapping (Acceptance Check 3)", () => {
  describe("Mathematical animation model (calculateVisualizerParams)", () => {
    it("maps LISTENING state to gentle idle breathing oscillation and baseline parameters", () => {
      // Idle state without volume
      const baseParams = calculateVisualizerParams("LISTENING", 0, 0);
      expect(baseParams.scale).toBeCloseTo(1.0, 2);
      expect(baseParams.rotationVelocity).toBe(1.0);
      expect(baseParams.radialDisplacement).toBe(1.0);

      // Periodic oscillation check at different times
      const pulseT1 = calculateVisualizerParams("LISTENING", 0, 1570); // sin(1.57) ~= 1
      expect(pulseT1.scale).toBeGreaterThan(1.0);
      expect(pulseT1.scale).toBeLessThanOrEqual(1.031);

      const pulseT2 = calculateVisualizerParams("LISTENING", 0, 4710); // sin(4.71) ~= -1
      expect(pulseT2.scale).toBeLessThan(1.0);
      expect(pulseT2.scale).toBeGreaterThanOrEqual(0.969);
    });

    it("maps THINKING state to concentrated orbital swirl with higher rotation and reduced radial displacement", () => {
      const listeningParams = calculateVisualizerParams("LISTENING", 0, 0);
      const thinkingParams = calculateVisualizerParams("THINKING", 0, 0);

      expect(thinkingParams.scale).toBe(1.0);
      // Higher rotation velocity than LISTENING
      expect(thinkingParams.rotationVelocity).toBeGreaterThan(listeningParams.rotationVelocity);
      expect(thinkingParams.rotationVelocity).toBe(2.5);

      // Reduced radial displacement compared to LISTENING
      expect(thinkingParams.radialDisplacement).toBeLessThan(listeningParams.radialDisplacement);
      expect(thinkingParams.radialDisplacement).toBe(0.5);
    });

    it("maps SPEAKING state to dynamic amplitude reactivity scaling up to 1.35 based on volume", () => {
      // At volume 0: scale is 1.0
      const quiet = calculateVisualizerParams("SPEAKING", 0);
      expect(quiet.scale).toBe(1.0);

      // At volume 0.5: scale is 1.0 + 0.5 * 0.35 = 1.175
      const mid = calculateVisualizerParams("SPEAKING", 0.5);
      expect(mid.scale).toBeCloseTo(1.175, 3);

      // At volume 1.0 (maximum volume): scale reaches exactly 1.35
      const max = calculateVisualizerParams("SPEAKING", 1.0);
      expect(max.scale).toBeCloseTo(1.35, 3);

      // Over-limit volume clamp test (volume > 1 clamps to 1.35)
      const overMax = calculateVisualizerParams("SPEAKING", 1.5);
      expect(overMax.scale).toBeCloseTo(1.35, 3);
    });
  });

  describe("Component DOM Rendering", () => {
    it("renders LISTENING state with listening status badge and attributes", () => {
      render(<VoiceVisualizer state="LISTENING" volume={0} />);
      const container = screen.getByTestId("voice-visualizer-container");
      expect(container).toBeTruthy();
      expect(container.getAttribute("data-state")).toBe("LISTENING");
      expect(screen.getByText(/Listening/)).toBeTruthy();
    });

    it("renders THINKING state with analysis status badge and orbital swirl velocity", () => {
      render(<VoiceVisualizer state="THINKING" volume={0} />);
      const container = screen.getByTestId("voice-visualizer-container");
      expect(container).toBeTruthy();
      expect(container.getAttribute("data-state")).toBe("THINKING");
      expect(container.getAttribute("data-rotation")).toBe("2.50");
      expect(container.getAttribute("data-displacement")).toBe("0.50");
      expect(screen.getByText(/analyzing your answer/i)).toBeTruthy();
    });

    it("renders SPEAKING state with voice volume reactivity", () => {
      render(<VoiceVisualizer state="SPEAKING" volume={1.0} />);
      const container = screen.getByTestId("voice-visualizer-container");
      expect(container).toBeTruthy();
      expect(container.getAttribute("data-state")).toBe("SPEAKING");
      expect(container.getAttribute("data-scale")).toBe("1.350");
      expect(screen.getByText(/Interviewer is speaking/i)).toBeTruthy();
    });
  });
});
