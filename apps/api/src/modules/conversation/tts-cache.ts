/**
 * Bounded in-memory cache for synthesized AI-turn audio plus a lightweight
 * voice-activity tracker used to decide when TTS pre-warming is worth the cost.
 *
 * The cache lets replays (e.g. "Replay question") and the normal audio fetch
 * after a pre-warmed turn be served instantly instead of re-synthesizing.
 * It is per-process state; multi-instance deployments may synthesize once per
 * instance, which is acceptable because audio is never persisted long-term.
 */

export const ttsAudioCacheTtlMs = 10 * 60_000;
export const ttsAudioCacheMaxEntries = 64;
/** A turn is considered voice-active only if voice was used recently. */
export const voiceActivityWindowMs = 5 * 60_000;

type CachedAudio = { audio: Buffer; expiresAt: number };

const audioCache = new Map<string, CachedAudio>();
const voiceActivityByInterview = new Map<string, number>();
const inFlightPreWarms = new Map<string, Promise<Buffer | null>>();

export function getCachedAudio(turnId: string, now = Date.now()): Buffer | null {
  const entry = audioCache.get(turnId);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    audioCache.delete(turnId);
    return null;
  }
  return entry.audio;
}

export function setCachedAudio(turnId: string, audio: Buffer, now = Date.now()): void {
  pruneExpired(now);
  audioCache.set(turnId, { audio, expiresAt: now + ttsAudioCacheTtlMs });
  while (audioCache.size > ttsAudioCacheMaxEntries) {
    // Map preserves insertion order; evict the oldest inserted entry.
    const oldest = audioCache.keys().next().value;
    if (oldest === undefined) break;
    audioCache.delete(oldest);
  }
}

export function markVoiceActive(interviewId: string, now = Date.now()): void {
  voiceActivityByInterview.set(interviewId, now);
  pruneVoiceActivity(now);
}

export function isVoiceActive(interviewId: string, now = Date.now()): boolean {
  const lastActive = voiceActivityByInterview.get(interviewId);
  if (lastActive === undefined) return false;
  if (now - lastActive > voiceActivityWindowMs) {
    voiceActivityByInterview.delete(interviewId);
    return false;
  }
  return true;
}

/** Guards against duplicate pre-warm synthesis for the same turn. */
export function isPreWarmInFlight(turnId: string): boolean {
  return inFlightPreWarms.has(turnId);
}

/** Resolves with the pre-warmed audio, or null once it is known unavailable. */
export function awaitPreWarm(turnId: string): Promise<Buffer | null> | null {
  return inFlightPreWarms.get(turnId) ?? null;
}

/** Registers an in-flight pre-warm so concurrent fetches await it instead of re-synthesizing. */
export function registerPreWarm(turnId: string, promise: Promise<Buffer | null>): void {
  inFlightPreWarms.set(turnId, promise);
  void promise.finally(() => {
    if (inFlightPreWarms.get(turnId) === promise) inFlightPreWarms.delete(turnId);
  });
}

/** Test seam: resets all cached state. */
export function clearTtsAudioCache(): void {
  audioCache.clear();
  voiceActivityByInterview.clear();
  inFlightPreWarms.clear();
}

function pruneExpired(now: number) {
  for (const [turnId, entry] of audioCache) {
    if (entry.expiresAt <= now) audioCache.delete(turnId);
  }
}

function pruneVoiceActivity(now: number) {
  for (const [interviewId, lastActive] of voiceActivityByInterview) {
    if (now - lastActive > voiceActivityWindowMs) voiceActivityByInterview.delete(interviewId);
  }
}
