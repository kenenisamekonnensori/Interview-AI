# API Specification

## Purpose

The Interview AI API provides a stable, versioned interface for the frontend,
mobile applications, and future third-party integrations.

The API is designed around business capabilities rather than AI operations.

Clients interact with interview sessions, resumes, reports, and transcripts.

Clients never communicate directly with language models.

All AI orchestration remains inside the backend.

---

# API Principles

- REST for business operations
- WebSocket/WebRTC for real-time interview communication
- Versioned APIs
- Authentication required for protected resources
- JSON request and response bodies
- Idempotent operations where applicable
- Structured error responses
- Cursor-based pagination
- Consistent naming conventions

Base URL

/api/v1

---

# Authentication

Authentication is handled by Better Auth.

Every protected endpoint requires an authenticated user.

Authorization is performed using the authenticated user identity.

The backend must never trust client-provided user IDs.

---

# API Modules

/api/v1

├── users
├── profile
├── resumes
├── job-descriptions
├── interviews
├── reports
├── transcripts
├── analytics
├── uploads
└── health

---

# User APIs

GET /users/me

Returns authenticated user information.

Response

{
  "id": "",
  "name": "",
  "email": "",
  "image": ""
}

---

PATCH /users/me

Update profile information.

---

# Candidate Profile

GET /profile

Returns candidate profile.

---

PUT /profile

Create or update candidate profile.

Fields

profession

experienceYears

targetRole

education

preferredLanguage

careerGoal

---

# Resume APIs

POST /resumes

Upload resume.

Accepts

multipart/form-data

Returns

resumeId

upload status

---

GET /resumes

List uploaded resumes.

---

GET /resumes/:resumeId

Return resume metadata.

---

DELETE /resumes/:resumeId

Soft delete resume.

---

POST /resumes/:resumeId/analyze

Trigger resume analysis.

Returns

analysis status

---

GET /resumes/:resumeId/analysis

Returns structured resume analysis.

---

# Job Description APIs

POST /job-descriptions

Create job description.

Supports

Plain text

PDF upload

DOCX upload

---

GET /job-descriptions

List user job descriptions.

---

GET /job-descriptions/:id

Retrieve job description.

---

POST /job-descriptions/:id/analyze

Analyze job description.

---

GET /job-descriptions/:id/analysis

Return structured analysis.

---

# Interview APIs

POST /interviews

Create interview.

Request

{
    profileId,
    resumeId?,
    jobDescriptionId?,
    interviewType,
    difficulty,
    duration,
    language
}

Response

{
    interviewId,
    status
}

---

GET /interviews

List interviews.

Supports

pagination

filtering

sorting

status

---

GET /interviews/:id

Return interview summary.

---

DELETE /interviews/:id

Cancel interview.

Only possible before interview starts.

---

POST /interviews/:id/prepare

Creates interview plan.

Runs

Candidate Profiler

Resume Analysis

Job Analysis

Planner

Returns

READY

---

POST /interviews/:id/start

Starts interview.

Creates realtime session.

Returns

session information

voice configuration

ice servers

session token

---

POST /interviews/:id/pause

Pause interview.

---

POST /interviews/:id/resume

Resume interview.

---

POST /interviews/:id/end

Finish interview.

Triggers

Evaluation Pipeline

---

GET /interviews/:id/status

Returns

PREPARING

READY

IN_PROGRESS

PAUSED

EVALUATING

COMPLETED

FAILED

---

# Real-time Communication

The REST API is not responsible for interview conversation.

Voice conversation uses

WebRTC

or

WebSocket

depending on provider.

REST creates the session.

Realtime handles conversation.

---

Realtime Events

Client

SessionStarted

AudioChunk

TranscriptChunk

CandidateInterrupted

Ping

SessionEnded

Server

QuestionStarted

QuestionCompleted

TranscriptUpdated

ToolCalled

TopicChanged

DifficultyChanged

HintProvided

EvaluationUpdated

SessionCompleted

Error

---

# Transcript APIs

GET /interviews/:id/transcript

Returns full transcript.

---

GET /interviews/:id/transcript/stream

Streams transcript while interview is active.

---

# Evaluation APIs

GET /interviews/:id/evaluation

Returns complete interview evaluation.

Includes

overall score

category scores

recommendation

feedback

---

GET /interviews/:id/report

Returns final report.

---

GET /reports

Returns interview reports.

Supports pagination.

---

# Analytics APIs

GET /analytics/dashboard

Returns

interview count

average score

improvement trend

practice frequency

weakest skills

strongest skills

---

GET /analytics/history

Returns score history.

---

GET /analytics/topics

Returns topic performance.

---

# Upload APIs

POST /uploads

Generate upload URL.

Supports

resume

job description

future media

Returns

signed upload URL

storage key

---

POST /uploads/complete

Marks upload complete.

Triggers background processing.

---

# Health APIs

GET /health

Application health.

---

GET /health/ready

Readiness probe.

---

GET /health/live

Liveness probe.

---

# Error Format

Every endpoint returns the same error format.

{
    "success": false,
    "error": {
        "code": "RESOURCE_NOT_FOUND",
        "message": "...",
        "details": {}
    }
}

---

# Success Format

{
    "success": true,
    "data": {}
}

---

# Pagination

Cursor-based pagination.

{
    "items": [],
    "nextCursor": "...",
    "hasNextPage": true
}

---

# Idempotency

The following endpoints should support idempotency.

Interview creation

Resume upload completion

Interview preparation

Interview completion

---

# Background Jobs

Long-running operations should never block requests.

Examples

Resume parsing

Resume analysis

Job analysis

Interview planning

Evaluation generation

Embedding creation

Notification delivery

---

# Internal AI APIs

The frontend never calls these endpoints.

Used only by backend services.

Examples

Generate Interview Plan

Generate Next Question

Evaluate Answer

Generate Feedback

Generate Report

Retrieve Knowledge

Update Session Memory

These endpoints are private.

---

# Versioning

All APIs must be versioned.

/api/v1

Future breaking changes require

/api/v2

---

# API Philosophy

The public API exposes interview business operations.

Artificial intelligence is an implementation detail.

Clients ask to create interviews, upload resumes,
start sessions, and retrieve reports.

They never ask the backend to "send a prompt to the LLM."

This separation keeps the API stable even if the underlying AI
provider, models, prompts, or orchestration logic change.