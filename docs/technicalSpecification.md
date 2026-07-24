# Technical Specification

# Interviewer AI

Version: 1.0

---

# Purpose

This document defines the technical implementation of Interviewer AI.

It specifies the project's architecture, folder structure, application modules, interfaces, APIs, database ownership, AI integrations, event contracts, and engineering standards.

Unlike the System Design Document, this document focuses on implementation details.

---

# Technology Stack

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- Zustand
- React Hook Form
- Zod
- WebRTC

---

## Backend

- Node.js
- Fastify
- TypeScript
- Prisma ORM
- PostgreSQL
- Redis

---



## AI

- Gemini for reasoning, planning, interviewing, evaluation, and reports
- Deepgram for STT, TTS, and browser live-voice transport
- Structured Outputs
- Function Calling

---



## Storage

- Cloudflare R2

---



# Monorepo Structure

```text
apps/
    web/
    api/

packages/
    ui/
    shared/
    prompts/
    types/
    config/

docs/

scripts/
```

---



# Backend Structure

```text
src/

    modules/

        auth/

        users/

        resumes/

        jobs/

        interviews/

        conversation/

        ai/

        reports/

        analytics/

    plugins/

    middleware/

    services/

    utils/

    events/

    types/
```

Each module owns:

- routes
- service
- repository
- validation
- types

No module may directly manipulate another module's database entities.

---



# Frontend Structure

```text
app/

components/

features/

hooks/

services/

stores/

types/

lib/
```

Feature-specific logic belongs inside the corresponding feature folder.

---



# Domain Ownership



## Auth

Owns:

- authentication
- authorization
- sessions

---



## Resume

Owns:

- resume upload
- parsing
- storage

---



## Jobs

Owns:

- job descriptions
- extracted skills

---



## Interview

Owns:

- interview lifecycle
- interview persistence
- transcripts

---



## Conversation

Owns:

- conversation state
- AI session
- interruptions
- turn management

---



## Reports

Owns:

- evaluations
- summaries
- recommendations

---



# API Design



## Authentication

```http
POST /auth/login

POST /auth/register

POST /auth/logout
```

---



## Resume

```http
POST /resumes

GET /resumes/:id

DELETE /resumes/:id
```

---



## Job Description

```http
POST /jobs

GET /jobs/:id
```

---



## Interview

```http
POST /interviews

GET /interviews/:id

POST /interviews/:id/start

POST /interviews/:id/end
```

---



## Reports

```http
GET /reports/:id
```

---



# Conversation Manager

The Conversation Manager coordinates the interview.

Responsibilities:

- maintain state
- receive transcript updates
- invoke AI
- execute function calls
- control speaking state
- handle interruptions

No UI logic belongs here.

No persistence logic belongs here.

It calls the `AiProvider` interface only. Gemini/OpenAI request URLs, SDK types, prompts serialized for a provider, and response parsing must remain in `modules/ai/`; no controller may know a provider request format.

---

# AI Provider Module

`modules/ai/` is the only backend module that integrates a reasoning provider. The initial adapter is Gemini. It exposes `createInterviewPlan`, `generateInterviewerResponse`, `evaluateInterview`, and `generateReport` as domain capabilities. Resume and job analysis use an internal structured-analysis helper in that module.

Deepgram is a voice integration owned by the conversation module: it issues short-lived browser access tokens, transcribes live audio, and synthesizes persisted AI text. It does not plan or reason about an interview.

The active environment configuration is:

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash-lite
DEEPGRAM_API_KEY=
```

These keys are server-only. OpenAI variables are intentionally not configured. A future provider is added by implementing the provider interface, not by modifying controllers.

If Gemini fails, planning or response generation fails explicitly and does not invent output; live responses return `AI_RESPONSE_FAILED` while retaining the last valid state. If Deepgram fails, voice endpoints return `VOICE_UNAVAILABLE`; the user can use text turns where supported.

---



# Interview State Machine

```text
CREATED

↓

READY

↓

GREETING

↓

QUESTIONING

↓

LISTENING

↓

THINKING

↓

RESPONDING

↓

FOLLOW_UP

↓

NEXT_QUESTION

↓

CLOSING

↓

REPORTING

↓

COMPLETED
```

State transitions must be explicit.

No hidden transitions.

---



# Event Definitions

The application communicates internally using domain events.

```text
InterviewCreated

InterviewStarted

UserStartedSpeaking

UserStoppedSpeaking

TranscriptUpdated

QuestionGenerated

QuestionAnswered

AIStartedSpeaking

AIStoppedSpeaking

InterviewFinished

FeedbackGenerated
```

Events should describe something that has already happened.

---



# AI Responsibilities

The AI is responsible for:

- reasoning
- question generation
- follow-up generation
- evaluation
- summarization

The AI is NOT responsible for:

- authentication
- authorization
- persistence
- business rules
- database access

---



# Function Calling

Available tools include:

```text
getResume()

getJobDescription()

getInterviewContext()

saveTranscript()

generateNextQuestion()

finishInterview()

generateFeedback()
```

Every tool must:

- validate input
- return structured output
- be idempotent where appropriate

---



# Prompt Organization

```text
prompts/

    interviewer.md

    feedback.md

    scoring.md

    follow-up.md

    report.md
```

Each prompt has a single responsibility.

---



# Validation

Every request entering the backend must be validated.

Validation occurs before business logic executes.

Shared schemas should be reused whenever possible.

---



# Error Handling

Every endpoint returns structured errors.

Example:

```json
{
    "code": "INTERVIEW_NOT_FOUND",
    "message": "Interview does not exist."
}
```

Unexpected errors should never expose internal implementation details.

---



# Logging

Log:

- authentication events
- interview lifecycle
- AI tool execution
- failures
- retries

Avoid logging sensitive user information or complete prompts.

Never log full resumes, raw audio, complete transcripts, provider tokens, or unredacted provider request/response bodies. Log provider capability, failure category, status, retry count, and request ID only when available.

---



# Database Ownership

Each module owns its tables.

Example:

Auth

- users
- sessions

Interview

- interviews
- questions
- answers

Reports

- reports

Cross-module access must go through service interfaces rather than direct table manipulation.

---



# Security

- JWT authentication
- Secure cookies when applicable
- Rate limiting
- Input validation
- File validation
- Principle of least privilege
- HTTPS everywhere

---



# Coding Standards

- TypeScript strict mode
- ESLint
- Prettier
- No use of any
- Dependency injection where appropriate
- Small, focused services
- Pure business logic
- Descriptive naming
- Comprehensive error handling

---



# Testing Strategy

Unit Tests

- business logic
- utilities
- state machine

Integration Tests

- API endpoints
- database operations

End-to-End Tests

- authentication
- interview creation
- interview flow
- report generation

---



# Performance Goals

- Fast initial page load
- Low-latency voice interactions
- Responsive UI
- Efficient database queries
- Streaming AI responses
- Minimal blocking operations

---



# Deployment Targets

Frontend

- Vercel

Backend

- Railway or Fly.io

Database

- PostgreSQL

Cache

- Redis

Storage

- Cloudflare R2

---



# Engineering Principles

1. Business logic belongs in services.
2. AI is a reasoning engine, not the source of truth.
3. Modules communicate through well-defined interfaces.
4. Prefer composition over duplication.
5. Favor explicit state transitions.
6. Keep components small and focused.
7. Design for maintainability before optimization.
8. Optimize for readability and extensibility.

---



# Implementation Order

1. Initialize monorepo
2. Configure tooling
3. Authentication
4. Database schema
5. Resume module
6. Job description module
7. Interview module
8. Conversation Manager
9. AI integration
10. Feedback engine
11. Dashboard
12. Analytics
13. Deployment
14. Testing
15. Polish

---



# Summary

This specification defines the engineering contract for Interviewer AI.

Every feature should be implemented within its owning module, communicate through clear interfaces, and follow the architectural principles established in the System Design Document.

The goal is to produce a codebase that is modular, maintainable, testable, and easy for both engineers and AI coding agents to extend.
