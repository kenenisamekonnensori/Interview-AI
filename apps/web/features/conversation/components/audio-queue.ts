"use client";

import { webEnvironment } from "@/lib/env";
import { apiClient } from "@/lib/api-client";

export type AudioQueueItem = {
  interviewId: string;
  turnId: string;
  onPlay?: () => void;
  /** Called after the playback-completed acknowledgement resolves with the server-reported state. */
  onEnded?: (ackState?: string) => void;
  onError?: (error: Error) => void;
};

class AudioPlaybackQueue {
  private queue: AudioQueueItem[] = [];
  private isPlaying = false;
  private currentAudio: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;
  private isUnlocked = false;

  /**
   * Unlock browser HTMLAudio / AudioContext autoplay policy during user interaction gesture
   */
  public async unlockAudio(): Promise<boolean> {
    if (this.isUnlocked) return true;
    try {
      const silentAudio = new Audio(
        "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==",
      );
      silentAudio.volume = 0.01;
      await silentAudio.play();
      this.isUnlocked = true;
      console.log("[Audio Queue] Browser audio context unlocked successfully.");
      return true;
    } catch (err) {
      console.warn("[Audio Queue] Autoplay unlock failed or pending gesture:", err);
      return false;
    }
  }

  /**
   * Add AI response turn to playback queue
   */
  public enqueue(item: AudioQueueItem) {
    console.log(`[Audio Queue] Enqueued AI turn playback: ${item.turnId}`);
    // Avoid duplicate queuing of the exact same turn
    if (this.queue.some((q) => q.turnId === item.turnId)) return;
    this.queue.push(item);
    void this.processNext();
  }

  /**
   * Clear all pending items and stop current playback immediately
   */
  public cancelAll() {
    console.log("[Audio Queue] Cancelling all queued playback.");
    this.queue = [];
    this.stopCurrent();
  }

  /**
   * Stop current audio element and clean up Object URL resources
   */
  public stopCurrent() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.onplay = null;
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      this.currentAudio.src = "";
      this.currentAudio = null;
    }
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
    this.isPlaying = false;
  }

  /**
   * Process next item in the queue sequentially
   */
  private async processNext() {
    if (this.isPlaying || this.queue.length === 0) return;
    this.isPlaying = true;
    const item = this.queue.shift();
    if (!item) {
      this.isPlaying = false;
      return;
    }

    try {
      await this.unlockAudio();

      const response = await fetch(
        `${webEnvironment.NEXT_PUBLIC_API_URL}/api/v1/interviews/${item.interviewId}/conversation/turns/${item.turnId}/audio`,
        { credentials: "include" },
      );

      if (!response.ok) {
        throw new Error(`Audio fetch failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      this.currentObjectUrl = objectUrl;

      const audio = new Audio(objectUrl);
      this.currentAudio = audio;
      audio.dataset.turnId = item.turnId;

      audio.onplay = () => {
        console.log(`[Audio Queue] Playing AI turn ${item.turnId}`);
        item.onPlay?.();
      };

      audio.onended = () => {
        console.log(`[Audio Queue] Completed playback for turn ${item.turnId}`);
        this.stopCurrent();
        void apiClient<{ state?: string }>(
          `/api/v1/interviews/${item.interviewId}/conversation/turns/${item.turnId}/playback-completed`,
          { method: "POST" },
        )
          .then((ack) => {
            item.onEnded?.(ack.state);
            this.isPlaying = false;
            void this.processNext();
          })
          .catch((cause) => {
            console.error("[Audio Queue] Playback completed acknowledgement failed:", cause);
            item.onError?.(cause instanceof Error ? cause : new Error(String(cause)));
            this.isPlaying = false;
            void this.processNext();
          });
      };

      audio.onerror = (e) => {
        console.error(`[Audio Queue] Audio playback error for turn ${item.turnId}:`, e);
        this.stopCurrent();
        item.onError?.(new Error("Audio playback failed"));
        this.isPlaying = false;
        void this.processNext();
      };

      await audio.play();
    } catch (err) {
      console.error(`[Audio Queue] Failed to process turn ${item.turnId}:`, err);
      this.stopCurrent();
      item.onError?.(err instanceof Error ? err : new Error(String(err)));
      this.isPlaying = false;
      void this.processNext();
    }
  }
}

export const audioQueue = new AudioPlaybackQueue();
