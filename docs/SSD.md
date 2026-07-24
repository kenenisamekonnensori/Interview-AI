# System Design Document (SDD)

# Interviewer AI

Version: 1.0

---

# Purpose

This document describes the overall architecture of Interviewer AI, including the major system components, responsibilities, communication patterns, and data flow.

Its purpose is to provide a shared technical blueprint for development and serve as the primary reference for engineers and AI coding agents throughout the project.

This document focuses on system architecture rather than implementation details.

---

# System Overview

Interviewer AI is a real-time conversational interview platform where users interact with an AI interviewer through voice.

Unlike traditional chat applications, the platform maintains a continuous, low-latency conversation. The AI listens, reasons, asks follow-up questions, interrupts naturally when appropriate, evaluates responses, and generates detailed interview feedback.

The platform consists of four major domains:

- Client Application
- Backend Services
- AI Services
- Data Layer

Each domain has clearly defined responsibilities.

---



# High-Level Architecture

```text
                         User

                          │

                   Next.js Web App

                          │
                 WebRTC Voice Stream
                          │
        Deepgram voice + Gemini reasoning adapters
                          │
                 Function Calling Layer
                          │
                 Fastify Backend API
          ┌───────────┼────────────┐
          ▼           ▼            ▼
     PostgreSQL     Redis     Object Storage
```

---



# Architectural Principles

The system follows these principles:

- Modular architecture
- Domain-driven organization
- Event-driven communication
- Stateless backend services where possible
- Single responsibility for every module
- Strong separation between business logic and AI logic
- AI acts as a collaborator, not the source of truth
- Database remains the authoritative source of persistent data

---



# Core Domains



## Client Application

Responsibilities:

- User interface
- Authentication
- Voice controls
- Audio playback
- Display transcripts
- Interview dashboard
- Reports
- Settings

The client should contain minimal business logic.

Its primary responsibility is presentation and user interaction.

---



## Backend Services

Responsibilities:

- Authentication
- Authorization
- Resume processing
- Interview management
- Business rules
- Persistence
- Analytics
- AI tool execution
- Report generation

The backend owns all business logic.

The AI never directly modifies persistent data.

---



## AI Services

Responsibilities:

- Conduct conversation
- Generate interview questions
- Produce follow-up questions
- Evaluate responses
- Generate interview summaries
- Generate structured feedback

The AI is responsible for reasoning, not data management.

Whenever the AI needs external information, it requests it through function calls.

---



## Data Layer

Responsible for persistent storage.

Stores:

- Users
- Resumes
- Job Descriptions
- Interviews
- Questions
- Answers
- Reports
- Analytics

No AI-generated content is considered authoritative until validated and persisted by the backend.

---



# System Components



## Authentication Service

Responsibilities:

- Register users
- Login
- Session management
- Access control

---



## Resume Service

Responsibilities:

- Upload resumes
- Parse documents
- Store structured resume information
- Provide resume context to the AI

---



## Job Description Service

Responsibilities:

- Accept job descriptions
- Extract required skills
- Extract responsibilities
- Build interview context

---



## Interview Service

The central business module.

Responsible for:

- Creating interviews
- Managing interview lifecycle
- Maintaining interview state
- Saving transcripts
- Coordinating AI interactions
- Producing interview summaries

---



## Conversation Manager

The Conversation Manager orchestrates the live interview.

Responsibilities:

- Start session
- Maintain conversation state
- Receive transcript updates
- Decide when to invoke AI
- Handle interruptions
- Track interview progress
- Trigger follow-up questions
- End interview

This is the core orchestrator of the system.

---



## AI Orchestrator

Acts as the communication layer between the application and the AI provider.

Responsibilities:

- Build prompts
- Supply conversation context
- Execute function calls
- Receive structured responses
- Handle retries
- Validate AI output

No business logic belongs here.

It owns the provider interface and the initial Gemini adapter. The interface exposes `createInterviewPlan`, `generateInterviewerResponse`, `evaluateInterview`, and `generateReport`. Controllers and services supply domain context and receive validated domain outputs; they never construct provider payloads.

Deepgram is not an orchestrator: it owns STT, TTS, and browser live transport. Gemini owns reasoning, planning, interviewing, evaluation, and report generation. This split uses the providers' free development allowances while preserving a clean path to a future provider adapter.

---



## Feedback Engine

Responsible for generating the final interview evaluation.

Produces:

- Overall score
- Technical score
- Communication score
- Confidence score
- Strengths
- Weaknesses
- Recommendations

---



# Data Flow



## Interview Creation

```text
User

↓

Upload Resume

↓

Submit Job Description

↓

Backend Analysis

↓

Interview Context

↓

Create Interview

↓

Ready
```

---



## Live Interview

```text
User Speaks

↓

Voice Stream

↓

Deepgram STT

↓

Conversation Manager

↓

Gemini interviewer response

↓

Deepgram TTS

↓

User
```

This loop continues until the interview is completed.

---



## Interview Completion

```text
Conversation Ends

↓

Generate Transcript

↓

Generate Evaluation

↓

Persist Results

↓

Generate Report

↓

Display Feedback
```

---



# Conversation State Machine

Each interview progresses through defined states.

```text
CREATED

↓

PREPARING

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

GENERATING_REPORT

↓

COMPLETED
```

State transitions are deterministic and managed exclusively by the Conversation Manager.

---



# Function Calling

The AI interacts with the application only through approved tools.

Examples:

- Retrieve resume
- Retrieve job description
- Generate next question
- Save transcript
- Finish interview
- Generate report

The AI never performs direct database operations.

---



# Event-Driven Communication

The platform is built around events.

Examples include:

- InterviewCreated
- SessionStarted
- UserStartedSpeaking
- UserStoppedSpeaking
- TranscriptUpdated
- QuestionCompleted
- AIStartedSpeaking
- AIStoppedSpeaking
- InterviewCompleted
- ReportGenerated

Events reduce coupling between services and simplify future expansion.

---



# Persistence Strategy



## PostgreSQL

Persistent business data:

- Users
- Interviews
- Reports
- Questions
- Answers
- Job descriptions

---



## Redis

Ephemeral state:

- Active interview sessions
- Temporary conversation context
- Cached interview metadata
- Rate limiting

Redis is never the primary source of business data.

---



## Object Storage

Stores:

- Resume files
- Interview recordings
- Exported reports

---



# Security Principles

- Authenticated access to protected resources
- Server-side authorization
- Encrypted communication
- Secure file uploads
- Principle of least privilege
- Input validation on all public APIs
- Sensitive credentials stored securely
- Server-only Gemini and Deepgram keys; short-lived Deepgram browser tokens
- No logging of full resumes, raw audio, complete prompts, complete transcripts, or provider payloads

---



# Scalability Strategy

The architecture is designed so each major domain can scale independently.

Future scaling opportunities include:

- Dedicated AI workers
- Background processing
- Queue-based report generation
- Multiple AI providers
- Horizontal backend scaling
- CDN-backed asset delivery

The modular architecture allows individual services to evolve without requiring changes across the entire platform.

---



# Design Decisions

The system intentionally separates responsibilities:

- The frontend manages the user experience.
- The backend owns business rules.
- The AI focuses on reasoning and conversation.
- The database remains the source of truth.
- The Conversation Manager coordinates the interview lifecycle.

This separation keeps the platform maintainable, testable, and extensible as new interview types and AI capabilities are introduced.

---



# Summary

Interviewer AI is designed as a modular, real-time conversational platform centered around a single orchestration component: the Conversation Manager.

Every component has one clear responsibility, allowing the system to remain understandable, scalable, and easy to extend while delivering a natural interview experience.
