"use client";

/**
 * Browser audio plumbing for the agent voice pipeline (Phase 1 of the
 * voice-system roadmap).
 *
 * The agent gateway streams the interviewer's speech to the browser as raw
 * linear16 PCM frames (little-endian Int16 @ 24 kHz) and expects the
 * candidate's microphone as linear16 PCM @ 16 kHz. This module owns both
 * directions without touching the legacy MediaRecorder/audio-queue machinery.
 */

/** Schedules played audio strictly sequentially; stop() cancels everything. */
export class AgentAudioPlayer {
  private context: AudioContext | null = null;
  private playHead = 0;
  private sources: AudioBufferSourceNode[] = [];
  private idleWaiters: Array<() => void> = [];

  /** Must be called after a user gesture; the audio queue's unlock also covers it. */
  resume() {
    void this.ensureContext().resume();
  }

  push(chunk: ArrayBuffer) {
    if (chunk.byteLength === 0) return;
    const context = this.ensureContext();
    const samples = new Int16Array(chunk);
    const buffer = context.createBuffer(1, samples.length, AGENT_OUTPUT_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) {
      channel[i] = (samples[i] ?? 0) / 32_768;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    // Chunk scheduling: NTP-like continuation so PCM frames play seamlessly.
    if (this.playHead < context.currentTime + 0.05) {
      this.playHead = context.currentTime + 0.05;
    }
    source.start(this.playHead);
    this.playHead += buffer.duration;
    this.sources.push(source);
    source.onended = () => {
      this.sources = this.sources.filter((item) => item !== source);
      if (this.sources.length === 0) {
        for (const resolve of this.idleWaiters.splice(0)) resolve();
      }
    };
  }

  /** Resolves once all scheduled PCM chunks have reached playback completion. */
  whenIdle(): Promise<void> {
    if (this.sources.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  /** Cancel scheduled playback immediately (barge-in, teardown). */
  stop() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // already finished
      }
      source.disconnect();
    }
    this.sources = [];
    this.playHead = 0;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }

  dispose() {
    this.stop();
    if (this.context) {
      void this.context.close();
      this.context = null;
    }
  }

  private ensureContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext({ sampleRate: AGENT_OUTPUT_SAMPLE_RATE });
    }
    return this.context;
  }
}

export const AGENT_OUTPUT_SAMPLE_RATE = 24_000;
/** The agent gateway input encoding: linear16 mono @ 16 kHz. */
const INPUT_SAMPLE_RATE = 16_000;

/**
 * Captures the microphone as sequential 16 kHz Int16 PCM chunks. Uses a
 * ScriptProcessorNode: deprecated but universally available; the agent path is
 * behind a server flag and swappable for an AudioWorklet later.
 */
export class AgentMicCapture {
  private context: AudioContext;
  private source: MediaStreamAudioSourceNode;
  private processor: ScriptProcessorNode;

  constructor(
    stream: MediaStream,
    private readonly onChunk: (chunk: ArrayBuffer) => void,
    /** RMS of each raw capture block (0..1), for local voice-activity decisions. */
    private readonly onLevel?: (level: number) => void,
  ) {
    this.context = new AudioContext();
    this.source = this.context.createMediaStreamSource(stream);
    this.processor = this.context.createScriptProcessor(4_096, 1, 1);
    // Linear interpolation resample from the device rate to 16 kHz.
    const ratio = this.context.sampleRate / INPUT_SAMPLE_RATE;
    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      if (this.onLevel) {
        let energy = 0;
        for (let i = 0; i < input.length; i += 1) {
          const sample = input[i] ?? 0;
          energy += sample * sample;
        }
        this.onLevel(Math.sqrt(energy / Math.max(1, input.length)));
      }
      const outputLength = Math.max(1, Math.floor(input.length / ratio));
      const output = new Int16Array(outputLength);
      for (let i = 0; i < outputLength; i += 1) {
        const position = i * ratio;
        const index = Math.min(input.length - 1, Math.floor(position));
        const next = Math.min(input.length - 1, index + 1);
        const linear = position - index;
        const current = input[index] ?? 0;
        const following = input[next] ?? 0;
        const sample = current * (1 - linear) + following * linear;
        output[i] = Math.max(-32_768, Math.min(32_767, Math.round(sample * 32_767)));
      }
      this.onChunk(output.buffer);
    };
    this.source.connect(this.processor);
    // A silent output keeps the processor pumping (nodes only run when pulled).
    const sink = this.context.createGain();
    sink.gain.value = 0;
    this.processor.connect(sink);
    sink.connect(this.context.destination);
  }

  stop() {
    try {
      this.processor.disconnect();
      this.source.disconnect();
      void this.context.close();
    } catch {
      // already stopped
    }
  }
}
