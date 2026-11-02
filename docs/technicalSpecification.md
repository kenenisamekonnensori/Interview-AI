# Technical Specification

Version: 2.0
Status: Active Implementation Specification

---

# Purpose

This document defines the technical implementation of **Interviewer AI**. It specifies the project's monorepo structure, technology stack, application modules, domain boundaries, state machines, and engineering standards.

---

# Technology Stack

## Frontend (`apps/web`)
- **Framework**: Next.js 16 (App Router)
- **UI Library**: React 19, Tailwind CSS v4, shadcn/ui, Radix UI primitives, Lucide React
- **Graphics & Audio**: Three.js & `@react-three/fiber` (interactive 3D voice orb visualizer)
- **Data & State**: TanStack React Query v5, Zustand 5, React Hook Form, Zod
- **Real-Time Client**: WebAudio API (linear16 PCM capture & rolling buffer playback) + WebSocket voice transport + Server-Sent Events (SSE)
- **Authentication**: Better-Auth client (`apps/web/lib/auth-client.ts`)

## Backend (`apps/api`)
- **Runtime**: Node.js 22+ LTS (ESM), TypeScript 5.9+
- **HTTP Engine**: Fastify v5 with `@fastify/cors`, `@fastify/websocket`
- **Database & ORM**: PostgreSQL, Prisma ORM v7 with `@prisma/adapter-pg`
- **Caching & Real-Time Bus**: Redis (ioredis) for rate limiting, distributed leases, and pub/sub events
- **Background Jobs**: Dual-mode architecture:
  - *Monolith Mode*: In-process non-blocking task execution via `MonolithExecutionManager`
  - *Worker Mode*: BullMQ queues (`career-analysis`, `report-generation`, `auth-email`)
- **Document Processing**: `mammoth` (DOCX), `pdf-parse` (PDF)
- **Payments & Subscriptions**: Paddle Billing Node SDK v3 (`@paddle/paddle-node-sdk`)

## AI & Voice Infrastructure
- **Conversational Core**: Deepgram Voice Agent API (Nova-3 STT + Aura-2 TTS + Gemini streaming think) over a single server-owned WebSocket.
- **Reasoning Provider**: Google Gemini (`gemini-3.5-flash-lite`, fallback models supported) via `@google/genai` with strict Zod structured outputs.
- **Object Storage**: Cloudflare R2 (S3-compatible presigned upload URLs with signed owner metadata verification).
- **Transactional Email**: Resend SDK (`resend`).

---

# Monorepo Architecture

```text
interviewer-ai/
├── apps/
│   ├── web/                     # Next.js App Router client
│   └── api/                     # Fastify API, voice gateway & background workers
├── packages/
│   ├── config/                  # Shared environment schemas (server & web)
│   ├── prompts/                 # Versioned prompt templates (plan, report, agent, safety)
│   ├── shared/                  # Common constants and utilities
│   ├── types/                   # Authoritative DTOs, Zod schemas, enums & event types
│   └── ui/                      # Shared UI components
├── docs/                        # Architecture, API, and runbook documentation
└── scripts/                     # Operational scripts and deployment helpers
```

---

# Backend Module Architecture (`apps/api/src/modules/`)

Every domain capability lives in its own module following the `controller / service / repository / schema / types` pattern:

| Module | Responsibility | Owned Entities |
| :--- | :--- | :--- |
| **`auth`** | Identity, session validation, OAuth, verification emails | `User`, `Session`, `Account`, `Verification`, `AuthEmailOutbox` |
| **`users`** | User profiles, candidate experience, preferences | `UserProfile` |
| **`resumes`** | Resume upload ticket minting, storage verification, parsing | `Resume`, `ResumeAnalysis` |
| **`jobs`** | Target role descriptions, skill extractions, career targets | `JobDescription`, `JobAnalysis`, `CareerTarget` |
| **`interviews`** | Mock interview setup, plan orchestration, lifecycle transitions | `Interview`, `InterviewPlan` |
| **`conversation`**| Real-time voice gateway, Deepgram Agent WS, turn persistence, silence ladder | `Conversation`, `ConversationTurn`, `InterviewMemory` |
| **`ai`** | Provider adapters (Gemini), structured extraction, tool bridge | Provider SDKs & prompt invocation |
| **`reports`** | Evaluation rubrics, scoring calculations, hiring recommendations | `InterviewReport` |
| **`analytics`** | Skill gap analysis, progress trends, job readiness snapshots | `SkillAnalysis`, `ReadinessSnapshot` |
| **`practice-plan`**| Personalized preparation plans and actionable goals | `PracticePlan`, `PracticePlanItem` |
| **`billing`** | Paddle webhooks, subscription tiers, period usage counters | `BillingCustomer`, `Subscription`, `BillingEvent`, `UsageRecord`, `UsageCounter` |

No module may directly query or manipulate another module's database tables; cross-module capabilities are consumed through exported services.

---

# Authoritative State Machines

### 1. Interview Lifecycle (`InterviewStatus`)
```text
DRAFT -> PREPARING -> READY -> IN_PROGRESS -> COMPLETING -> COMPLETED
  │          │          │           │             │
  ▼          ▼          ▼           ▼             ▼
CANCELLED  CANCELLED  CANCELLED   FAILED        FAILED
```

### 2. Conversation States (`ConversationState`)
```text
GREETING -> SPEAKING -> LISTENING <───> TRANSCRIBING -> THINKING -> SPEAKING
                           │
                           ▼
                        CLOSING -> COMPLETED
```
- **Greeting**: Verbatim opening greeting spoken by Deepgram Voice Agent without blocking LLM calls.
- **Listening / Transcribing**: Candidate speech streamed; final transcript triggers server turn update.
- **Thinking**: Streaming think stage via Gemini model chain.
- **Speaking**: Aura-2 streaming TTS pushed as binary PCM chunks to the browser.
- **Silence Ladder**: Inactivity triggers canned clarifying nudges (max 2), followed by a topic move-on, before closing gracefully.

---

# Security & Data Minimization

1. **Authentication**: Handled via Better-Auth with session cookies (`httpOnly`, `secure`, `sameSite: lax` in production). Client IP rate limiting is enforced on sensitive endpoints via Redis.
2. **Provider Key Isolation**: Browser never holds Deepgram, Gemini, Resend, or Paddle credentials. Clients access voice solely via short-lived tickets.
3. **Storage Security**: Direct R2 uploads require HMAC signed metadata (`x-amz-meta-owner-user-id`, `x-amz-meta-resume-id`). The API verifies metadata and exact content length before marking uploads ready.
4. **PII & Privacy**: Audio streams are processed live in-memory and never stored to disk. Transcripts are retained per `TRANSCRIPT_RETENTION_DAYS` (default 0). Logs redact credentials, prompt templates, resume contents, and raw speech.
