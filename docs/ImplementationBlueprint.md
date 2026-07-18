# Implementation Blueprint

# Interviewer AI

Version: 1.0

---

# Purpose

This document defines how the project is organized and how every part of the system should be implemented.

It establishes clear ownership, responsibilities, boundaries, and dependencies for every module so that engineers and AI coding agents can work consistently without introducing architectural drift.

This document is the implementation guide for the codebase.

---

# Guiding Principles

* Every module has one responsibility.
* Every feature belongs to exactly one module.
* Business logic lives on the backend.
* The frontend focuses on user experience.
* AI reasons; backend enforces business rules.
* Shared code belongs in packages, not applications.
* Prefer composition over duplication.

---

# Project Structure

```text
interviewer-ai/

├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── ui/
│   ├── shared/
│   ├── prompts/
│   ├── types/
│   └── config/
│
├── docs/
├── scripts/
└── infrastructure/
```

Everything belongs to one of these directories.

Nothing should exist without a clear owner.

---

# apps/

Applications that users or external systems interact with.

## web/

Responsibilities

* User interface
* Authentication flow
* Dashboard
* Interview experience
* Voice interface
* Reports
* Settings

Should contain

* Pages
* Components
* Client state
* API hooks
* UI logic

Must not contain

* Business rules
* Database access
* AI prompts

---

## api/

Responsibilities

* REST APIs
* Realtime APIs
* Authentication
* Business logic
* AI orchestration
* Database access
* File storage
* Report generation

Should contain

* Modules
* Services
* Repositories
* Validators
* Controllers

Must not contain

* UI components
* Presentation logic

---

# packages/

Reusable code shared across applications.

---

## ui/

Reusable design system.

Contains

* Buttons
* Inputs
* Cards
* Dialogs
* Layout components

No business logic.

---

## shared/

Shared utilities.

Contains

* Helpers
* Constants
* Common utilities

Must remain framework-agnostic.

---

## prompts/

AI prompt library.

Contains

* System prompt
* Interview prompt
* Follow-up prompt
* Feedback prompt
* Report prompt

One responsibility per prompt.

No prompt should exceed its purpose.

---

## types/

Shared TypeScript types.

Contains

* DTOs
* API contracts
* Event types
* Shared interfaces

Applications should import these instead of redefining types.

---

## config/

Shared configuration.

Contains

* Environment schemas
* Feature flags
* Shared configuration

No application logic.

---

# Backend Module Structure

Every backend module follows the same structure.

```text
module/

├── controller.ts
├── service.ts
├── repository.ts
├── schema.ts
├── types.ts
├── events.ts
└── index.ts
```

Consistency is mandatory.

Developers should recognize every module immediately.

---

# Backend Modules

## auth/

Owns

* Registration
* Login
* Sessions
* Authorization

Never owns

* User profile
* Interview data

---

## users/

Owns

* User profile
* Preferences
* Account settings

---

## resumes/

Owns

* Resume upload
* Resume parsing
* Resume versions

---

## jobs/

Owns

* Job descriptions
* Skill extraction
* Role metadata

---

## interviews/

Owns

* Interview lifecycle
* Configuration
* Plans
* Sessions

This is the primary business module.

---

## conversation/

Owns

* Conversation state
* Turn management
* Realtime coordination
* Interruptions

This module orchestrates live interviews.

---

## ai/

Owns

* AI provider integration
* Prompt composition
* Function calling
* Structured outputs

Never owns business rules.

---

## reports/

Owns

* Evaluation
* Feedback
* Reports

Produces immutable interview summaries.

---

## analytics/

Owns

* User progress
* Historical metrics
* Trends

Only reads completed interview data.

---

# Frontend Features

Organize by feature, not by component type.

```text
features/

authentication/

dashboard/

resume/

job-description/

interview/

conversation/

report/

settings/
```

Each feature contains everything required for that feature.

Avoid global folders that mix unrelated concerns.

---

# Dependency Rules

Allowed

```text
web

↓

api

↓

database
```

Allowed

```text
conversation

↓

ai
```

Not allowed

```text
ui

↓

database
```

Not allowed

```text
prompts

↓

business logic
```

Dependencies should always point inward toward shared abstractions, never sideways across unrelated modules.

---

# Coding Standards

Every module should:

* Export a clear public API.
* Hide implementation details.
* Keep files focused.
* Prefer small services.
* Avoid circular dependencies.
* Use strict typing.
* Validate all external input.

---

# Definition of Done

A feature is complete only when:

* It satisfies its documented responsibility.
* It does not violate module boundaries.
* It includes validation.
* Errors are handled gracefully.
* Types are shared where appropriate.
* Tests pass.
* Documentation is updated when behavior changes.

---

# Implementation Order

Build the platform in vertical slices.

1. Foundation

   * Repository
   * Tooling
   * Configuration
   * Authentication

2. Career

   * Resume
   * Job Description

3. Interview

   * Interview creation
   * Interview planning
   * Session management

4. Conversation

   * Voice interface
   * Conversation Manager
   * Realtime events
   * AI integration

5. Evaluation

   * Scoring
   * Feedback
   * Reports

6. Analytics

   * History
   * Progress
   * Dashboard

7. Production Readiness

   * Testing
   * Monitoring
   * Performance
   * Deployment

Each phase should result in a working, demonstrable product increment.

---

# Engineering Goal

The structure of the codebase should communicate the architecture without requiring additional explanation.

Every engineer—or AI coding agent—should be able to identify where a feature belongs, understand its responsibilities, and extend it confidently without introducing duplication or architectural inconsistencies.
