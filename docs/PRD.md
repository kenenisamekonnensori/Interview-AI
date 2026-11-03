# Product Requirements Document (PRD)

# Interviewer AI

Version: 2.0
Status: Active Product Specification

---

# Vision

Preparing for technical and professional interviews should feel like preparing with an experienced human hiring manager—not filling out forms or texting a basic chatbot.

**Interviewer AI** provides realistic, voice-based mock interviews that adapt to the candidate in real time. It listens, asks dynamic follow-up questions, allows natural interruptions, evaluates responses against realistic rubrics, and delivers actionable coaching. Beyond individual interviews, the platform guides candidates through an end-to-end career readiness loop: setting career targets, diagnosing skill gaps, completing personalized practice plans, and tracking readiness over time.

---

# Problem Statement

Most interview preparation platforms today are passive:
- Candidates read static question lists, watch videos, or chat with text bots.
- These tools fail to replicate the pressure, pacing, unpredictability, and conversational flow of a real technical or behavioral interview.
- Candidates often enter real hiring rounds technically knowledgeable but conversationally unprepared to explain their decisions under pressure.

---

# Product Solution & Core Loop

Interviewer AI combines server-authoritative voice AI with deep career analytics:

```text
Target Role & Resume Upload
          │
          ▼
AI Interview Plan & Real-Time Voice Simulation
(Barge-in, dynamic follow-ups, natural turn-taking)
          │
          ▼
Structured Evaluation & Feedback Report
          │
          ▼
Skill Gap Analysis & Job Readiness Score
          │
          ▼
Personalized Practice Plan (Repeat & Master)
```

---

# User Personas

1. **Job Seekers & Career Changers**: Preparing for high-stakes interviews, needing to build communication confidence and identify weak areas before real interviews.
2. **University Students & New Grads**: Technically skilled candidates lacking real-world technical interviewing experience.
3. **Senior Professionals**: Preparing for promotions or transitions into System Design and Leadership roles.

---

# Core Features

### 1. Career Profile & Document Processing
- **Multi-Resume Management**: Upload PDF or DOCX resumes; automatic text extraction and skill analysis via AI.
- **Job Description Targeting**: Input real job postings; AI extracts required competencies and technologies.
- **Career Targets**: Durable target roles binding required competencies to historical interview progress.

### 2. Conversational Real-Time Voice Interview
- **Ultra-Low-Latency Voice Stream**: Sub-800ms end-to-end turn latency over WebRTC (LiveKit SFU + Deepgram Nova-3 STT + Gemini 2.0 Flash Think + Cartesia Sonic / Deepgram Aura-2 TTS).
- **Headphone-Free Audio Quality**: Hardware-accelerated browser Acoustic Echo Cancellation (AEC), allowing candidates to speak naturally through built-in laptop speakers and microphones.
- **Neural Turn-Taking (Silero VAD)**: Intonation-aware speech detection that tolerates natural thinking pauses ("hmm...") without cutting off the candidate mid-sentence.
- **Natural Barge-In**: The candidate can interrupt the interviewer at any time; playback halts instantly (≤ 150 ms).
- **Active Conversational Steering**: Monologue Guard that gently steers candidates rambling past 90 seconds, plus calibrated responses to hint requests.
- **Silence Ladder**: Tiered clarifying nudges if the user is silent, automatic topic move-ons if unanswered, and graceful session closing.
- **Interview Types**: Technical, Behavioral (STAR method), System Design, Leadership, and Mixed.
- **Difficulty Modes**: Easy, Medium, Hard with adaptive questioning.

### 3. Comprehensive Evaluation & Reporting
- **Multidimensional Scoring**: Overall score (0–100), Communication, Technical Depth, Problem Solving, and Relevance.
- **Speech Delivery Analytics**: Words Per Minute (WPM) cadence gauge, filler word frequency heatmap ("like", "um", "you know"), and talk-to-listen ratios.
- **STAR Method Breakdown**: Structural scoring of Situation, Task, Action ("I" vs "We"), and Result (quantified business impact).
- **Staff-Level Exemplar Rewrites**: Side-by-side model answers demonstrating how a top candidate responds to struggling questions.
- **Actionable Evidence**: Every score links directly to specific conversational turns and quotes.
- **Hiring Recommendation**: Strong No Hire, Lean No Hire, Lean Hire, or Strong Hire assessment with constructive next steps.

### 4. Career Readiness & Practice Plans
- **Job Readiness Score**: Weighted readiness calculation (0–100) combining performance trends, skill coverage against the target role, practice recency, and consistency.
- **Skill Matrix**: Historical tracking of strengths, recurring weaknesses, and proficiency levels across canonical skills.
- **Personalized Practice Plans**: Actionable sequence of practice goals with auto-advancement upon interview completion.
- **Targeted Question Micro-Drills ("Re-Do" Mode)**: Single-click 3-minute focused practice drills directly from the feedback report to master weak questions without repeating full 45-minute sessions.

### 5. Monetization & Subscription Tiers
- **Paddle Billing Integration**: Free tier (2 interviews/mo, 15 min cap), Pro tier (20 interviews/mo, 45 min cap, deep skill analysis, priority think chain), Enterprise tier.
- Self-service billing portal and automated monthly usage resets.

---

# Non-Functional Requirements

- **Voice Latency**: Target end-to-end voice latency ≤ 800 ms p95 (TTFT ≤ 500 ms, TTS first byte ≤ 100 ms) for human conversational cadence.
- **Audio Quality**: Zero speaker bleed or audio echo using built-in laptop speakers/microphones without headphones.
- **Reliability**: Server-authoritative state machine; lost connections resume cleanly from database state without losing conversational context.
- **Privacy & Security**: Zero audio storage; ephemeral in-memory processing. Candidate resumes and transcripts are protected by strict ownership checks and configurable data retention policies.
