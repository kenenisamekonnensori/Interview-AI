# Voice System Roadmap — Server-Authoritative Interview Platform

Version: 1.0
Status: Approved design (Pathway 1: Deepgram Voice Agent API as conversational core); implementation pending.

---

# Purpose

This document is the implementation roadmap for upgrading the interview voice system from the
current client-orchestrated pipeline (browser → Deepgram direct + REST/SSE signaling) to a
production-grade, server-authoritative voice platform, built the way real products
(Retell / Vapi / LiveKit-style stacks) are built. It defines the target architecture, the exact
provider protocol contract, the interviewer-brain design, the turn-taking policy, and the phased
execution plan.

It supplements, and for voice transport supersedes, `docs/architecture.md` ("Live voice
transport" row). All other boundaries of `architecture.md` (provider-agnostic AI module,
Conversation Manager ownership, persistence, privacy rules) remain in force.

---

# Current state and why it must change

The current voice pipeline is **client-authoritative**: the browser connects directly to Deepgram
STT with a granted token, the server synthesizes whole TTS blobs, the server's conversation state
machine advances only on client REST acknowledgements (`playback-completed`), and the realtime
LLM turn is a blocking structured-JSON generation.

Diagnosed failure modes (2026-10 investigation, confirmed in production sessions):

| Failure | Root cause | Class |
| --- | --- | --- |
| Greeting/first question arrives after minutes | Unbounded network segments (Deepgram SDK token grant, TTS synthesis, pre-warm await, browser fetch — none with deadlines); playback serially waits for transport before audio; recovery/retry cycles on provider quota | Structural |
| Silent candidate never re-engaged reliably | Watchdog armed only by client `playback-completed` ack; one missed ack silently disarms it; state stuck in SPEAKING/THINKING | Structural |
| Backend is blind to voice activity | Browser→Deepgram direct audio; server never sees VAD events; `/user-speech-started` endpoint unused by the client | Structural |
| Dead air after answers | Non-streaming JSON-schema LLM turn (blocks TTFT), serialized fetch chain, serial audio queue | Structural |
| Nudges stop permanently after 2 strikes | `maxSilenceNudgesPerTurn` exhaustion with no "move on" stage | Policy gap |
| In-memory watchdogs lost on API reload | Timers live in process memory; dev reloads erase them silently | Reliability |

These are not bugs to patch; they are properties of a client-orchestrated design. The fix is an
architecture change, not more retry envelopes.

---

# Target architecture

## Overview

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ BROWSER (thin client — capture and playback only)                        │
│  getUserMedia → 16 kHz PCM frames → ONE WS to our voice gateway          │
│  WebAudio rolling replay buffer  ← server pushes binary audio chunks     │
└──────────────────────────────────────────────────────────────────────────┘
                 audio in│ ▲audio + agent events out
                         ▼ │
┌──────────────────────────────────────────────────────────────────────────┐
│ OUR API  = SESSION OWNER (voice gateway)                                 │
│  • WS route: /api/v1/interviews/:id/conversation/ws (auth ticket)        │
│  • Opens and owns the single Deepgram Agent WebSocket (server key)       │
│  • Drives the interview state machine from agent events                  │
│  • Persists turns via the existing ConversationService/Prisma models     │
│  • Publishes existing SSE realtime events for the web UI                 │
│  • Enforces silence/ladder policy, barge-in, duration metering           │
└──────────────────────────────────────────────────────────────────────────┘
                             │ ONE WS (agent.deepgram.com)
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ DEEPGRAM VOICE AGENT API                                                 │
│  STT (Nova-3) → Think (BYO Gemini endpoint, our key) → TTS (Aura-2)      │
│  End-of-turn detection, interruption/barge-in, Streaming: built-in       │
└──────────────────────────────────────────────────────────────────────────┘
```

Key property: **the browser never holds a Deepgram credential** and never makes a provider call.
The conversation timeline is advanced by server-observed events, not client acknowledgements.

## Why this split

| Previous failure mode | Handled where in the new design |
| --- | --- |
| LLM JSON-mode non-streaming → 8–20 s dead air | Realtime `think` streams plain text (no schema); JSON assessment moves to an async post-turn worker |
| Minute-scale unbounded hangs | One WS with Settings/KeepAlive; audio is a continuous binary stream; no per-segment fetches to hang |
| Client-owned timeline via `playback-completed` acks | Server drives state from agent events; acks become UI-only |
| Backend deaf to voice activity | `UserStartedSpeaking` and end-of-turn arrive server-side; silence policy is a server decision |
| Deepgram token handed to the browser | Relay is server-to-Deepgram; no browser credential |
| Serial blob playback queue | Audio streams continuously; ordering is the socket itself |

---

# Protocol contract (Deepgram Voice Agent API)

Gateway session lifecycle per interview:

1. **Connect.** Browser WS → gateway authenticates (reuse `VoiceTicketService`, short TTL),
   creates the session, opens the Deepgram Agent WS, awaits `Welcome`.
   Do not send anything before `Welcome`.

2. **Settings → SettingsApplied.** Gateway sends `Settings`:
   - `audio.input`: `{ encoding: "linear16", sample_rate: 16000 }`
   - `audio.output`: `{ encoding: "linear16", sample_rate: 24000, container: "none" }`
   - `agent.listen`: `deepgram nova-3` (Flux upgrade is a later optimization; keep language +
     keyterm support)
   - `agent.think`: BYO **Google AI Studio** endpoint (`generativelanguage.googleapis.com`
     `:streamGenerateContent?alt=sse`, `x-goog-api-key` header). Instruction = interviewer
     persona + interview plan + session context pack. Optional ordered fallback chain via the
     `think` array (e.g. second Google credential or an OpenAI-compatible provider) —
     provider-quota exhaustion finally has a first-class answer.
   - `agent.speak`: Aura-2 per-language models (unchanged from `ttsModelFor`).

3. **Greeting.** After `SettingsApplied`, gateway sends an `InjectUserMessage` with a
   deterministic instruction to deliver the greeting. The greeting is the same streaming think
   loop from the first millisecond — no separate blocking LLM call anywhere.

4. **Runtime loop (all server-side).** Event → system action mapping:

   | Agent event | Gateway action |
   | --- | --- |
   | `UserStartedSpeaking` | Cancel pending silence nudges; blank client replay buffer (barge-in); SSE `UserSpeechStarted` |
   | `ConversationText` (user, turn-final) | Persist USER turn through existing append-turn transaction state guards |
   | `AgentThinking` | UI state THINKING (SSE); mark in-turn state |
   | `ConversationText` (agent) | Persist AI turn; enqueue post-turn assessment job; SSE `AIResponseGenerated` |
   | Binary audio frames | Forward to browser; tee a rolling server-side copy ("what was actually spoken") |
   | `AgentAudioDone` | State → LISTENING; arm the server-side silence watchdog |
   | `Warning` (`THINK_REQUEST_FAILED`) | Observability; the think fallback chain retries with the next provider |
   | `Error` (`FAILED_TO_THINK` / `FAILED_TO_SPEAK`) | Degraded path: canned server response via `InjectAgentMessage`; offer text mode if persistent |

5. **Keepalive and caps.** Gateway sends `KeepAlive` every ≤8 s while idle; the Agent WS allows
   ≤2 h, comfortably above the `durationMinutes` interview cap.

6. **Completion.** Closing statement via inject; on final `AgentAudioDone` run the existing
   `requestCompletion` → report worker flow, unchanged.

## Latency SLOs

Aligned with published production budgets (~800 ms total per-turn budget; Flux end-of-turn
~260 ms p50; streaming LLM TTFT target ≤500 ms; TTS first byte 80–200 ms):

| Metric | Target |
| --- | --- |
| Greeting first audible byte from `SettingsApplied` | ≤ 1.5 s |
| User final answer → agent first audible byte | ≤ 1.8 s p95 |
| Canned silence nudge (inject, no LLM) | ≤ 300 ms |
| Barge-in playback stop | ≤ 150 ms from `UserStartedSpeaking` |

SLOs are verified by an automated test harness with synthetic user audio, not by manual vibes.

---

# Interviewer brain: two lanes

This is the central product-quality design. The realtime lane is optimized for perceived
latency; the offline lane owns interview quality.

## Realtime lane (Deepgram agent + Gemini streaming)

- Persona + interview plan + a **precomputed context pack** (plan topics/objectives, resume
  summary + skills, job required skills, memory digest) baked into the `think` instruction —
  all fetched once at session start; they are small.
- Per-turn dynamic state (covered topics, weak areas, unresolved follow-ups) pushed via
  `UpdateSettings` after each completed turn.
- **No function calling in the voice loop** — tool calls inside a live turn add 30–80 % latency.
  Retrieval is pre-baked into the context pack instead.
- Keep the existing interviewer prompt machinery; project it into the agent `think`
  instruction.

## Offline lane (existing BullMQ workers)

- After each agent turn, a lightweight assessment-extraction job (structured JSON, current
  prompt machinery, generous retries — nobody is waiting) updates `InterviewMemory`,
  `topicCoverage`, weak-area lists, difficulty adaptation inputs.
- Duplicate-question detection and closing logic remain **server-side rules** fed by this
  memory — not realtime prompt behavior.

---

# Turn-taking, barge-in, and silence policy

All server-side; canned injects are instant because they bypass the LLM.

**Silence ladder** after agent audio completes with no user speech:

1. ~9 s → `InjectAgentMessage` canned invite ("Take your time…") — the existing strike-1 text.
2. ~8 s more → canned offer ("Pause here, or move to the next question?") — the strike-2 text.
3. **Move-on (new):** third silence event instructs the agent to proceed to the next planned
   topic and record the struggle in its assessment. A human interviewer moves on; the ladder
   must never end in permanent silence again.

**Barge-in:** agent yields on `UserStartedSpeaking`; UI stops playback immediately from the
pushed event (no round-trip). Nudges cancel on speech onset; the watchdog re-arms if speech
stops without a finalized turn (false-start guard).

**Duration:** connection expiry maps onto the interview clock; abandoned sessions auto-close
and trigger the report. Orphaned-session risk disappears.

---

# Phased execution plan

Each phase is independently shippable and independently testable. Follow the execution
principles of `docs/implementationRoadmap.md` (single objective, no unrelated changes).

## Phase 0 — Stop the bleeding (urgent, no architecture change)

### Goal
Remove the minute-scale hang class from the CURRENT pipeline and get baseline measurements.

### Deliverables
- Hard deadlines (`AbortSignal.timeout`) on every remaining network segment: Deepgram SDK calls
  (token grant, live connect, TTS synthesis + stream consumption), the audio route's
  `awaitPreWarm`, and all browser fetches (audio queue included, 10–15 s).
- Kill the serial audio queue hang: per-item fetch timeout before falling back to text mode.
- Client reconciliation: on SSE (re)connect and on a cheap periodic probe, refetch and reconcile
  server conversation state (no more single-shot, client-owned ack dependence).
- Wire and document the per-stage latency observability events
  (`ai.provider.*`, `voice.provider.*`, `conversation.turn.generation`).

### Exit criteria
- No session step can exceed its documented deadline; a hung provider call degrades in ≤15 s.
- A scripted hang simulation recovers with a visible fallback, not silent minutes.
- Baseline latency numbers recorded for the greeting and one full Q&A round.

## Phase 1 — Voice Gateway skeleton (parallel-run behind a flag)

### Goal
Stand up our API as the session owner over the Deepgram Agent API, running in parallel with
the legacy path.

### Deliverables
- New `@fastify/websocket` route + gateway session manager; agent transport module; browser
  voice client (PCM capture + rolling replay buffer with barge-in flush).
- Feature flag `voicePipeline: agent | legacy` per session; legacy stays default.
- Turn persistence and SSE publishing through the EXISTING conversation models and event
  vocabulary — no client data-model change.

### Exit criteria
- An agent-mode interview produces persisted turns and SSE events identical to legacy DTOs.
- Greeting ≤ 1.5 s; answer→response ≤ 1.8 s; barge-in works; a WS drop resumes from DB state.
- No Deepgram credential ever reaches the browser in agent mode.

## Phase 2 — Interviewer brain and interview contract

### Goal
Port interview quality into the new two-lane design.

### Deliverables
- BYO Gemini think configuration + context pack; `UpdateSettings` memory pump.
- Async post-turn assessment worker; duplicate-question and closing rules ported to server rules.
- Greeting via deterministic inject; no-voice-start-without-plan guard preserved.

### Exit criteria
- Plan coverage and memory-driven adaptation behave equivalent to legacy, with the realtime
  turn never blocked by assessment work.
- THINK failures degrade gracefully (fallback chain / canned recovery), never fabricate content.

## Phase 3 — Turn-taking and silence policy

### Goal
Make the interview _feel_ like a human interviewer.

### Deliverables
- Full silence ladder incl. the move-on stage; false-start handling.
- Duration meter + auto-close; per-interview Deepgram/LLM usage counters wired toward billing.

### Exit criteria
- The three experienced failure scenarios — greeting lag, silent candidate, post-answer dead
  air — are all covered by scripted automated cases that pass.
- An abandoned session closes itself and produces the report.

## Phase 4 — Production-grade hardening

### Goal
Operate like a platform, not a demo.

### Deliverables
- Multi-instance realtime: Redis pub/sub behind the events bus so SSE works from any instance.
- Session-state recovery after gateway restart (watchdog re-arm on server touch; resume from DB).
- Concurrency management against Deepgram plan limits; soak/load runs.
- Transcript retention / PII policy per `architecture.md` privacy rules.

### Exit criteria
- Two-instance deployment passes a soak test without state divergence.
- Failure drills (gateway restart, provider outage, client network drop) recover correctly.

## Phase 5 — Product differentiators (post-core)

- Report quality upgrades from exact per-question turn/timing data.
- Performance analytics, coaching review waves, shareable outcomes.

---

# Approved decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Conversational core | Deepgram Voice Agent API (bundled runtime) | Fastest path to correct turn-taking; already in the provider stack; our differentiation is interview quality + reports, not STT glue |
| Realtime think provider | BYO Google AI Studio Gemini (existing key) | Zero new spend; managed support documented; fallback chain reserves an OpenAI-compatible provider as later config, not rearchitecture |
| Transport | WebSocket PCM relay (server-owned) | Browser-standard, no new infra; WebRTC via LiveKit remains swappable later for mobile/telephony |
| Realtime output format | Streaming plain text (no JSON schema in the voice loop) | TTFT is the budget-critical metric; structure moves to the offline lane |
| Cutover | Parallel-run behind a per-session flag; legacy remains fallback until agent-mode meets SLOs for one week of real sessions | Risk control |
| Function calling in voice loop | Disabled in realtime, retrieval pre-baked in context pack | Tool calls add 30–80 % latency inside live turns |

# Required document amendments during implementation

- `docs/architecture.md`: replace the "Live voice transport" row (browser-to-Deepgram token
  model) with the server-owned gateway model; keep the provider-agnostic boundary language.
- `docs/api&event.md`: add the voice gateway WS route, its session message contract, the
  `voicePipeline` flag semantics, and note that SSE event payloads are unchanged.
- `docs/observability.md` (or equivalent): register the new per-stage latency events and SLOs.

# Open product decisions (not blockers for Phase 0–1)

1. Whether to add an OpenAI-compatible fallback provider key in Phase 2 or defer to Phase 4.
2. Deepgram Agent per-connected-minute cost acceptance thresholds and per-interview budget caps
   (metering lands Phase 3; the cap policy needs a product value).
3. Whether keyterm prompting (candidate's resume/project vocabulary) is enabled from Phase 2 or
   tuned later from real-session WER data.
