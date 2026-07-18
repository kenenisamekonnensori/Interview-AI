# API & Event Contract

## Purpose

This document defines how every part of Interviewer AI communicates.

It establishes the contracts between the frontend, backend, AI services, and real-time voice session. It is the single source of truth for all HTTP APIs, real-time events, request/response formats, and ownership boundaries.

---

# Communication Principles

The platform uses three communication patterns:

* **REST** — Business operations (authentication, interviews, reports).
* **Realtime** — Live voice sessions, transcripts, and interview events.
* **Function Calls** — Requests from the AI to the backend for business data or actions.

Each pattern has a clear responsibility and should never overlap.

---

# REST APIs

REST is used for operations that create, update, retrieve, or delete persistent business data.

Examples:

* Authentication
* Resume management
* Job descriptions
* Interview management
* Reports
* User profile

REST endpoints should be:

* Stateless
* Versioned
* Validated
* Idempotent where appropriate

---

# Realtime Events

Realtime communication powers the live interview experience.

Events represent something that has already happened.

Examples:

* SessionConnected
* SessionDisconnected
* UserStartedSpeaking
* UserStoppedSpeaking
* TranscriptUpdated
* QuestionGenerated
* AIStartedSpeaking
* AIStoppedSpeaking
* InterviewCompleted

Events should never contain business logic—they only communicate state changes.

---

# AI Function Calls

The AI never reads or writes the database directly.

Instead, it interacts with the application through approved tools.

Examples:

* Get active resume
* Retrieve job description
* Generate interview context
* Save transcript
* Finish interview
* Generate report

Every tool must have a clear input, output, validation, and ownership.

---

# API Principles

* Business logic belongs to backend services.
* Realtime transports live state, not persistence.
* AI communicates only through tools.
* PostgreSQL remains the single source of truth.
* Every request and event is typed and validated.

---

# Success Criteria

An engineer should understand:

* Which communication method to use.
* When to use it.
* Who owns each operation.
* How data moves through the system.
* How the AI interacts with the application.
