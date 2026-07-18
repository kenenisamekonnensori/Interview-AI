# Conversation Engine Specification

## Purpose

This document defines how a live interview behaves from the moment a session starts until it ends.

It specifies conversation flow, turn-taking, interruptions, timing, and state transitions to create an interview experience that feels natural and responsive.

---

# Design Goal

The candidate should feel like they are speaking with a professional interviewer—not a chatbot.

Every interaction should be conversational, adaptive, and low latency.

---

# Conversation Lifecycle

Every interview follows the same high-level flow:

Greeting → Interview → Follow-ups → Closing → Evaluation

The AI may adapt the path, but it always follows this lifecycle.

---

# State Machine

Every session transitions through explicit states.

Draft

↓

Preparing

↓

Greeting

↓

Listening

↓

Thinking

↓

Speaking

↓

Follow-up

↓

Next Question

↓

Closing

↓

Completed

No hidden or implicit transitions are allowed.

---

# Turn-Taking

Only one participant speaks at a time.

The engine coordinates:

* Listening
* Speaking
* Waiting
* Thinking

Each turn has a clear beginning and end.

---

# Interruptions

The engine supports natural interruptions ("barge-in").

If the candidate speaks while the AI is talking:

1. Stop AI audio immediately.
2. Preserve conversation context.
3. Resume listening.
4. Continue the interview naturally.

Interruptions should feel seamless and never reset the conversation.

---

# Conversation Context

Each decision considers:

* Current interview stage
* Previous questions
* Previous answers
* Candidate progress
* Time remaining
* Active interview objective

The engine always reasons from the current context rather than isolated messages.

---

# Timing

The engine should:

* Detect when the candidate has finished speaking.
* Allow natural pauses.
* Avoid responding too early.
* Minimize response latency.
* Keep the conversation flowing naturally.

---

# Principles

* Conversations are event-driven.
* State changes are explicit.
* Every turn advances the interview.
* Interruptions are first-class behavior.
* The interview remains coherent from start to finish.

---

# Success Criteria

A complete interview should feel continuous, adaptive, and human-like, with smooth transitions between listening, reasoning, and speaking while maintaining a consistent conversational flow.
