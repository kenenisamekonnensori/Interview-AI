# Domain Model Specification

# Interviewer AI

Version: 1.0

---

# Purpose

The Domain Model Specification defines the core business concepts of Interviewer AI and how they relate to one another.

It establishes a shared language for the product, ensuring engineers, designers, AI coding agents, and future contributors describe the system consistently.

This document intentionally avoids implementation details such as databases, APIs, or frameworks. Instead, it focuses on the business model that the software represents.

---

# Domain Philosophy

Every concept in the system should represent something meaningful to the business.

A domain object should answer one question:

> "If Interviewer AI were a real company, would employees naturally talk about this thing?"

If the answer is yes, it likely belongs in the domain.

---

# Core Domains

The platform is organized into the following domains.

```text
Identity

Career

Interview

Conversation

Evaluation

Reporting

Analytics
```

Each domain owns a distinct part of the business and is responsible for its own rules.

---

# Identity Domain

## Purpose

Represents people who use the platform.

### Primary Entity

**User**

Represents an individual using Interviewer AI.

A User can:

* Create interviews
* Upload resumes
* Manage job descriptions
* View reports
* Track progress
* Configure preferences

A User owns all personal interview data.

---

# Career Domain

Represents the professional information used to personalize interviews.

## Resume

Represents a candidate's professional profile.

A Resume contains:

* Personal information
* Work experience
* Education
* Skills
* Projects
* Certifications

A User may have multiple resumes.

Only one resume is active for an interview.

---

## Job Description

Represents the position the candidate is preparing for.

Contains:

* Company
* Role
* Responsibilities
* Required skills
* Preferred qualifications
* Experience level

A Job Description may be reused across multiple interviews.

---

# Interview Domain

The central domain of the application.

Everything ultimately revolves around an Interview.

---

## Interview

Represents a complete interview experience.

An Interview owns:

* Configuration
* Session
* Conversation
* Questions
* Answers
* Evaluation
* Report

An Interview cannot exist without a User.

---

## Interview Configuration

Represents settings selected before the interview begins.

Includes:

* Interview type
* Difficulty
* Language
* Target role
* Duration
* AI personality (future)

Configuration becomes immutable once the interview starts.

---

## Interview Plan

Represents the interview strategy generated before the conversation begins.

Contains:

* Planned topics
* Skill coverage
* Estimated timeline
* Question sequence
* Evaluation focus

The plan guides the interview but may change dynamically during the conversation.

---

# Conversation Domain

Responsible for the live interaction between the candidate and the AI interviewer.

---

## Interview Session

Represents one live interview execution.

Responsible for:

* Start time
* End time
* Duration
* Current state
* Connection status

Only one active session may exist for an Interview.

---

## Conversation

Represents the complete dialogue between candidate and interviewer.

Contains:

* Turns
* Transcript
* Speaking events
* AI responses
* User responses

The Conversation grows continuously throughout the interview.

---

## Conversation Turn

Represents one exchange between participants.

A turn belongs to exactly one speaker.

Types:

* AI Question
* Candidate Answer
* Follow-up
* Clarification
* Greeting
* Closing

Conversation is composed entirely of ordered turns.

---

## Question

Represents a prompt asked by the interviewer.

Questions may be:

* Planned
* Dynamic
* Follow-up
* Clarification

Questions are generated from the Interview Plan and the evolving conversation.

---

## Answer

Represents a candidate's response to a Question.

Answers contain:

* Transcript
* Duration
* Confidence indicators
* Supporting metadata

Every Answer belongs to one Question.

---

# Evaluation Domain

Represents how performance is measured.

Evaluation begins during the interview and completes when the interview ends.

---

## Evaluation

Represents the complete assessment of an Interview.

Contains:

* Technical evaluation
* Communication evaluation
* Behavioral evaluation
* Confidence evaluation
* Overall score

Only one Evaluation exists per Interview.

---

## Feedback

Represents actionable recommendations for improvement.

Includes:

* Strengths
* Weaknesses
* Missed opportunities
* Suggested improvements
* Practice recommendations

Feedback is generated from the Evaluation.

---

# Reporting Domain

Represents the final deliverable presented to the user.

---

## Report

Summarizes everything that occurred during an Interview.

Contains:

* Interview overview
* Scores
* Feedback
* Timeline
* Key observations
* Recommendations

Reports are immutable once generated.

---

# Analytics Domain

Tracks long-term user improvement.

---

## Progress Profile

Represents historical interview performance.

Tracks:

* Completed interviews
* Average score
* Improvement trends
* Frequently missed topics
* Confidence changes
* Practice frequency

Progress Profile is derived from completed interviews.

---

# Relationships

```text
User
├── Resume
├── Job Descriptions
├── Interviews
└── Progress Profile

Interview
├── Configuration
├── Plan
├── Session
├── Conversation
├── Evaluation
└── Report

Conversation
├── Turns
├── Questions
└── Answers

Evaluation
└── Feedback
```

---

# Ownership Rules

Ownership is explicit.

A User owns:

* Resumes
* Job Descriptions
* Interviews

An Interview owns:

* Session
* Conversation
* Evaluation
* Report

A Conversation owns:

* Turns
* Questions
* Answers

No entity may have multiple owners.

---

# Lifecycle

## Interview

```text
Draft

↓

Configured

↓

Ready

↓

Running

↓

Completed

↓

Reported

↓

Archived
```

State transitions are one-way unless explicitly defined.

---

## Session

```text
Waiting

↓

Connecting

↓

Active

↓

Paused

↓

Finished
```

---

## Conversation

```text
Created

↓

Greeting

↓

Interview

↓

Closing

↓

Completed
```

---

# Business Invariants

The following rules must always be true.

* Every Interview belongs to exactly one User.
* Every Session belongs to exactly one Interview.
* Every Conversation belongs to one Session.
* Every Question belongs to one Conversation.
* Every Answer belongs to one Question.
* A completed Interview cannot return to a running state.
* A Report cannot exist before an Evaluation.
* Feedback cannot exist without an Evaluation.
* Only one active Session may exist for an Interview.

These invariants define the business rules of the platform and must be enforced regardless of implementation.

---

# Aggregate Boundaries

The system is organized around aggregates.

## User Aggregate

Root:

* User

Children:

* Resume
* Job Description

---

## Interview Aggregate

Root:

* Interview

Children:

* Configuration
* Plan
* Session
* Conversation
* Evaluation
* Report

---

## Conversation Aggregate

Root:

* Conversation

Children:

* Turn
* Question
* Answer

---

# Ubiquitous Language

The following terms should be used consistently across the codebase, documentation, and user interface.

| Business Term    | Meaning                                  |
| ---------------- | ---------------------------------------- |
| User             | A person using the platform              |
| Resume           | A candidate's professional profile       |
| Job Description  | The target role being practiced          |
| Interview        | A complete interview experience          |
| Session          | One live execution of an interview       |
| Conversation     | The dialogue between candidate and AI    |
| Turn             | A single exchange from one speaker       |
| Question         | A prompt from the interviewer            |
| Answer           | A candidate's response                   |
| Evaluation       | The assessment of interview performance  |
| Feedback         | Actionable recommendations               |
| Report           | The final interview summary              |
| Progress Profile | Historical performance across interviews |

---

# Summary

The Domain Model defines the language and structure of Interviewer AI.

Every database table, API endpoint, backend module, frontend feature, AI tool, and conversation workflow should map directly to one or more domain concepts defined in this document.

Maintaining this alignment ensures the platform remains understandable, consistent, and extensible as it evolves.
