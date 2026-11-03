# Voice System Specification & V1 Audio Architecture

Version: 2.0
Status: Active Production Architecture & V1 Audio Upgrade Specification

---

# Purpose

This document defines the production voice architecture of Interviewer AI: a server-authoritative voice platform built the way modern voice products operate. It specifies the voice gateway protocol, the two-lane interviewer brain, turn-taking policies, multi-instance concurrency, and the V1 audio-focused architecture upgrade.

---

# Core Architecture: Two-Lane Design

Conversational latency must be strictly decoupled from deep interview evaluation. The system separates live voice interaction from offline assessment into two independent lanes:

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ REALTIME LANE (Sub-Second Latency Loop)                                 │
│  • Voice capture & playback: Low-latency audio streaming                 │
│  • Speech-to-Text (STT) + Streaming LLM Think + Text-to-Speech (TTS)     │
│  • Neural Voice Activity Detection (VAD) & Instant Barge-In (≤ 150 ms)   │
│  • Plain spoken text only: NO JSON schemas or tool calls in audio loop   │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ Turn settled (AgentAudioDone)
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ OFFLINE LANE (Asynchronous Evaluation Workers)                           │
│  • Post-turn structured assessment via Gemini (JSON mode)                │
│  • Updates InterviewMemory: covered topics, weak areas, question history │
│  • Refreshes dynamic context digest for subsequent turns (UpdateThink)   │
│  • Post-interview comprehensive evaluation & rubric scoring              │
└──────────────────────────────────────────────────────────────────────────┘
```

---

# Session Lifecycle & Concurrency Management

1. **Authentication & Ticket Minting**:
   - Client requests a single-use voice ticket via `POST /api/v1/interviews/:id/voice-token`.
   - Provider credentials (e.g. `DEEPGRAM_API_KEY`, `GEMINI_API_KEY`) remain strictly server-only. Clients never receive provider tokens.

2. **Distributed Ownership (`VoiceSessionRegistry`)**:
   - Live voice sessions hold a renewed Redis lease per interview ID.
   - The newest connection supersedes any existing connection: the previous owner is closed with code `4001` over a control channel. The superseded client continues in text mode rather than reconnect-fighting.

3. **Concurrency Limiting (`VoiceConcurrencyLimiter`)**:
   - Enforces deployment-wide ceiling (`VOICE_MAX_CONCURRENT_SESSIONS`, default 100) using a shared Redis atomic acquire with stale-entry expiration.
   - Over-capacity sessions cleanly degrade to typed interview mode with code `1013` rather than opening failing provider sockets.

---

# Server-Authoritative Turn-Taking & Silence Ladder

Turn state and conversation timelines are advanced exclusively by server-observed events, never client acknowledgements.

### Silence Ladder Policy
When agent audio finishes (`AgentAudioDone`), the server transitions to `LISTENING` and arms the silence watchdog:
1. **Strike 1 (~9–12 s idle)**: Canned invite (*"Take your time..."*) injected as an instant clarification turn without LLM delay.
2. **Strike 2 (~8 s later)**: Canned offer (*"Would you like to pause here, or move to the next question?"*).
3. **Strike 3 (Move-On)**: The interviewer changes topic, records the struggle in `InterviewMemory` as a weak area, and proceeds to the next planned question. The ladder never ends in permanent dead air.
4. **Graceful Completion**: When move-on budget or interview duration is spent, the agent speaks a closing statement and triggers the report generation worker.

### Barge-In Policy
- Agent speech halts immediately on candidate speech onset (`UserStartedSpeaking`).
- Client immediately purges its audio replay buffer.
- Silence nudges are disarmed immediately on speech detection.

---

# V1 Audio Architecture Upgrade: Transitioning to WebRTC (LiveKit)

For Version 1, the platform focuses strictly on **audio-only excellence**. To solve real-world network jitter, audio clipping, and speaker echo, the transport and voice runtime are upgraded as follows:

```text
┌────────────────────────────────────────────────────────┐
│ CANDIDATE BROWSER (LiveKit WebRTC Client)              │
│  • High-fidelity Opus Audio (24–32 kbps adaptive)      │
│  • Hardware-accelerated browser Echo Cancellation (AEC)│
└───────────────────────────┬────────────────────────────┘
                            │ WebRTC (UDP / SRTP)
                            ▼
┌────────────────────────────────────────────────────────┐
│ LIVEKIT SFU (Media Server)                             │
│  • Sub-50ms media routing, Packet Loss Concealment     │
│  • Dynamic jitter buffer, Global edge traversal        │
└───────────────────────────┬────────────────────────────┘
                            │ Low-latency worker loop
                            ▼
┌────────────────────────────────────────────────────────┐
│ LIVEKIT AGENT RUNTIME                                  │
│  • Silero VAD (Neural turn detection & intonation)     │
│  • STT: Deepgram Nova-3                                │
│  • LLM: Gemini 2.0 Flash / Claude 3.5 Sonnet           │
│  • TTS: Cartesia Sonic / Deepgram Aura-2               │
└───────────────────────────┬────────────────────────────┘
                            │ Synchronize turns & state
                            ▼
┌────────────────────────────────────────────────────────┐
│ FASTIFY BACKEND & PRISMA POSTGRESQL                    │
│  • Auth, Career Targets, Readiness Engine, Reports     │
└────────────────────────────────────────────────────────┘
```

### Why LiveKit Over Raw WebSockets
1. **UDP WebRTC vs. TCP WebSockets**:
   - WebSockets run over TCP, where minor packet loss causes Head-of-Line blocking and audio stutter.
   - WebRTC over UDP uses Opus codec with Packet Loss Concealment (PLC), providing seamless audio even under adverse network conditions.
2. **Hardware Acoustic Echo Cancellation (AEC)**:
   - Native WebRTC media engine allows candidates to interview using built-in laptop speakers and microphones without headphones, eliminating false barge-in loops.
3. **Neural Turn Detection (Silero VAD)**:
   - Replaces fixed-duration silence timers with pitch- and intonation-aware VAD, distinguishing thinking pauses (*"Hmm, let me consider..."*) from finished answers.
4. **Sub-800ms Voice Latency**:
   - Pairing Deepgram Nova-3 transcription with Cartesia Sonic TTS delivers sub-100ms first-audio-byte synthesis, achieving human conversational cadence.

---

# Pedagogical Coaching Upgrades (V1 Feature Focus)

To make Interviewer AI an effective skill-building tool, V1 introduces actionable speech analytics and instant practice loops:

1. **Speech Cadence & Delivery Analytics**:
   - **Words Per Minute (WPM)**: Pacing feedback (optimal: 130–160 WPM).
   - **Filler Word Heatmap**: Detection and counting of *"like"*, *"um"*, *"you know"*, *"sort of"*.
   - **Talk-to-Listen Ratio**: Detection of monologuing vs. concise answers.
2. **STAR Method Breakdown (Behavioral Interviews)**:
   - Per-question scoring of Situation, Task, Action, and Result components.
3. **Exemplar "Model" Answers**:
   - Side-by-side comparison between candidate's verbatim answer and a top-tier exemplar response.
4. **Targeted Micro-Drill ("Re-Do" Mode)**:
   - One-click capability on the interview report to re-try any fumbled question in a focused 3-minute voice drill without restarting the full interview.

---

# Implementation Reference

- Complete architectural specifications and data flow: [`docs/interview-architecture.md`](./interview-architecture.md)
- Phased implementation runbook and verification checkpoints: [`docs/building-phase.md`](./building-phase.md)
