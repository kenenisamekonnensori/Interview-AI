# AI Architecture Specification

## Purpose

This document defines how the AI behaves inside Interviewer AI.

It describes the AI's responsibilities, reasoning process, available tools, memory strategy, prompt organization, and interaction with the rest of the system.

The AI is a collaborator—not the application itself.

---

# Responsibilities

The AI is responsible for:

* Conducting natural conversations.
* Asking interview questions.
* Generating follow-up questions.
* Evaluating responses.
* Producing structured feedback.

The AI is **not** responsible for:

* Authentication
* Business rules
* Database access
* State management
* Persistence

---

# Core Components

## Conversation Manager

The orchestrator of every interview.

Responsibilities:

* Maintain interview state.
* Coordinate AI interactions.
* Manage interruptions.
* Decide when the AI listens or speaks.
* Trigger function calls.
* End the interview.

---

## Prompt System

Prompts are modular.

Each prompt has one responsibility.

Examples:

* System prompt
* Interviewer prompt
* Follow-up prompt
* Scoring prompt
* Feedback prompt
* Report prompt

No single "mega prompt" should exist.

---

## AI Tools

The AI interacts with the platform only through function calls.

Examples:

* Retrieve resume
* Retrieve job description
* Retrieve interview context
* Save transcript
* Generate report

The AI never bypasses these interfaces.

---

## Memory

The AI maintains only conversation memory.

Memory includes:

* Current interview stage
* Previous questions
* Candidate answers
* Conversation summary
* Active interview context

Persistent user data always comes from backend services.

---

# Guiding Principles

* AI reasons; the backend decides.
* AI never owns business data.
* Every AI response is structured and predictable.
* Context is supplied intentionally, never assumed.
* Prompts remain modular and reusable.

---

# Success Criteria

The AI should feel like an experienced interviewer while remaining predictable, maintainable, and tightly integrated with the application.
