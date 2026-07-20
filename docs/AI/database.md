# Database Design

## Purpose

The database is the source of truth for all interview-related data.

The database must persist users, interview sessions, candidate profiles,
uploaded documents, transcripts, evaluation reports, scores, analytics,
and historical progress.

The database should never store AI state that can be regenerated.

Instead, it stores deterministic business data that represents the user's
history and interview outcomes.

---

# Design Principles

The database should follow these principles.

- Normalized where appropriate
- UUID primary keys
- Soft delete where required
- Audit friendly
- Event driven
- Optimized for read-heavy analytics
- AI provider independent
- Scalable
- Easy to extend

---

# High Level ER Diagram

User
│
├── Candidate Profile
│
├── Resume
│
├── Interview Session
│      │
│      ├── Interview Configuration
│      │
│      ├── Uploaded Documents
│      │
│      ├── Transcript
│      │
│      ├── Interview Events
│      │
│      ├── Evaluation
│      │
│      ├── Feedback
│      │
│      └── Scores
│
└── Interview History

---

# Core Entities

## User

Represents an authenticated account.

Fields

id

name

email

image

createdAt

updatedAt

Authentication information is managed by Better Auth.

The Interview Platform extends the user with interview-related data.

---

## CandidateProfile

Represents interview preferences and career information.

Fields

id

userId

profession

targetRole

experienceYears

currentPosition

education

preferredLanguage

country

timezone

bio

careerGoal

createdAt

updatedAt

A user has one active profile.

---

## Resume

Represents uploaded resumes.

Fields

id

userId

storageKey

fileName

mimeType

fileSize

status

uploadedAt

analysisVersion

createdAt

A user may upload multiple resumes.

Only one may be marked as active.

---

## ResumeAnalysis

Stores structured resume extraction.

Never reparse the resume unless necessary.

Fields

resumeId

summary

skills

technologies

projects

education

certifications

experience

strengths

weaknesses

embeddingId

analysisVersion

generatedAt

---

## JobDescription

Represents uploaded or pasted job descriptions.

Fields

id

userId

title

company

source

rawText

createdAt

---

## JobAnalysis

Structured interpretation of the job description.

Fields

jobDescriptionId

requiredSkills

preferredSkills

responsibilities

keywords

seniority

technologyStack

embeddingId

generatedAt

---

# Interview Session

Represents one interview.

Fields

id

userId

candidateProfileId

resumeId

jobDescriptionId

status

startedAt

completedAt

duration

language

interviewType

difficulty

targetRole

companyStyle

voiceProvider

model

createdAt

---

Status

CREATED

PREPARING

READY

IN_PROGRESS

PAUSED

EVALUATING

COMPLETED

FAILED

CANCELLED

---

# Interview Configuration

Stores immutable settings used for the session.

Fields

interviewSessionId

difficulty

expectedDuration

voice

language

allowHints

allowInterruptions

companyStyle

interviewMode

Once the interview starts this configuration should never change.

---

# Interview Plan

Stores the generated interview plan.

Fields

interviewSessionId

objectives

topics

evaluationRubric

estimatedTimeline

followUpStrategy

generatedAt

This is generated once before the interview begins.

---

# Transcript

Represents every spoken utterance.

Fields

id

interviewSessionId

speaker

text

startTime

endTime

confidence

sequence

createdAt

Speaker values

USER

AI

SYSTEM

Transcript is append-only.

Never modify existing transcript records.

---

# Transcript Metadata

Optional metadata attached to transcript entries.

Fields

transcriptId

emotion

speechRate

latency

interruption

voiceActivity

tokenCount

This table is optional.

---

# Interview Event

Stores important runtime events.

Fields

id

interviewSessionId

eventType

payload

createdAt

Examples

QuestionGenerated

AnswerReceived

TopicChanged

ToolCalled

HintProvided

DifficultyChanged

InterviewPaused

InterviewResumed

EvaluationUpdated

These events improve debugging and analytics.

---

# Interview Topic

Tracks interview progress.

Fields

id

interviewSessionId

topic

status

difficulty

startedAt

completedAt

Topics may include

JavaScript

TypeScript

React

Node.js

System Design

Behavioral

Database

Algorithms

---

# Question

Represents every question asked.

Fields

id

topicId

question

questionType

difficulty

expectedSkill

generatedBy

sequence

createdAt

Question Types

Technical

Behavioral

Coding

Scenario

System Design

Leadership

Follow-up

Clarification

---

# Candidate Answer

Stores structured information about answers.

Fields

id

questionId

transcriptId

summary

confidence

responseDuration

analysisVersion

createdAt

Raw transcript already exists.

This table stores AI-generated structure.

---

# Evaluation

Stores interview evaluation.

Fields

id

interviewSessionId

overallScore

recommendation

summary

generatedAt

Recommendation

Strong Hire

Hire

Borderline

No Hire

---

# Evaluation Category

Stores detailed scoring.

Fields

evaluationId

category

score

feedback

evidence

Categories

Technical Knowledge

Communication

Problem Solving

Confidence

System Design

Leadership

Behavioral

Coding

Architecture

---

# Improvement Recommendation

Fields

id

evaluationId

title

description

priority

resource

estimatedStudyTime

Priority

High

Medium

Low

---

# Interview Feedback

Represents final feedback.

Fields

evaluationId

strengths

weaknesses

missedOpportunities

learningRoadmap

nextInterviewRecommendation

---

# Session Memory Snapshot

Stores deterministic memory snapshots.

Fields

interviewSessionId

coveredTopics

remainingTopics

candidateStrengths

candidateWeaknesses

activeTopic

questionCount

updatedAt

This exists to recover sessions if interrupted.

---

# File Storage

Files should never be stored inside PostgreSQL.

Store only metadata.

Supported providers

S3

Cloudflare R2

Supabase Storage

UploadThing

Vercel Blob

Database stores only

storageKey

url

mimeType

size

checksum

---

# Embeddings

Embeddings should live separately.

Fields

id

resourceType

resourceId

provider

embeddingId

createdAt

The vector itself should be stored in a vector database or pgvector.

Supported resources

Resume

Job Description

Interview

Transcript

Feedback

---

# Analytics

Generate from interview history.

Examples

Average Score

Average Communication

Improvement Rate

Most Missed Topics

Average Interview Duration

Hire Recommendation Trend

Interview Count

Practice Frequency

---

# Relationships

User

1 → 1 CandidateProfile

User

1 → N Resume

User

1 → N JobDescription

User

1 → N InterviewSession

InterviewSession

1 → 1 InterviewConfiguration

InterviewSession

1 → 1 InterviewPlan

InterviewSession

1 → N Transcript

InterviewSession

1 → N InterviewEvent

InterviewSession

1 → N InterviewTopic

InterviewSession

1 → 1 Evaluation

Evaluation

1 → N EvaluationCategory

Evaluation

1 → N ImprovementRecommendation

InterviewTopic

1 → N Question

Question

1 → 1 CandidateAnswer

Resume

1 → 1 ResumeAnalysis

JobDescription

1 → 1 JobAnalysis

---

# Database Philosophy

The database is not designed around prompts.

It is designed around interviews.

Every table represents a real business concept.

The AI can change over time.

The interview history should remain stable.

This separation ensures the platform remains maintainable,
provider-independent, and scalable as new AI capabilities are added.