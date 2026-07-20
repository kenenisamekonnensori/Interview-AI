# AI Agent Architecture

## Purpose

The AI Interview Engine is responsible for conducting realistic, adaptive, and personalized interviews that closely resemble interviews conducted by experienced human interviewers.

The engine must not rely on a single monolithic prompt.

Instead, it should use an orchestrated architecture composed of specialized agents, deterministic services, tools, structured outputs, memory, and state management.

The objective is to separate responsibilities, improve reliability, reduce hallucinations, simplify testing, and allow independent evolution of each component.

---

# Architecture Overview

                    ┌──────────────────────────────┐
                    │      Interview Session       │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                   ┌────────────────────────────────┐
                   │    Interview Orchestrator      │
                   └────────────────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          ▼                        ▼                        ▼
 Interview Planner        Conversation Agent       Evaluation Agent
          │                        │                        │
          ▼                        ▼                        ▼
 Interview Plan           Tool Calling Layer        Feedback Engine
          │                        │                        │
          └──────────────┬─────────┴───────────────┘
                         ▼
                   Shared Session Memory
                         │
                         ▼
                  Persistent Data Store

---

# Design Principles

The AI system must follow these principles.

- Single responsibility for every component.
- Deterministic business logic implemented in code.
- LLM used only where reasoning or natural language generation is required.
- Stateless model calls.
- Session state managed outside the model.
- Tool-first architecture.
- Structured outputs whenever possible.
- Event-driven communication.
- Streaming by default.
- Testable components.
- Observable execution.

---

# Interview Orchestrator

## Responsibility

The Interview Orchestrator coordinates the entire interview lifecycle.

It is not an LLM.

It is deterministic application logic.

The orchestrator is responsible for:

- session initialization
- loading candidate profile
- loading resume analysis
- loading job description analysis
- loading interview configuration
- selecting active interview stage
- invoking AI agents
- routing tool calls
- maintaining state
- emitting events
- persisting transcript
- handling failures
- ending interview
- triggering evaluation

The orchestrator owns the interview state machine.

---

# Interview Planner

## Purpose

The planner prepares the interview before the first question is asked.

The planner executes once at interview startup.

Inputs:

- candidate profile
- resume analysis
- job description analysis
- interview type
- target role
- seniority
- interview duration

Outputs:

Interview Plan

The plan contains:

- interview objectives
- interview phases
- evaluation rubric
- topic priority
- estimated timeline
- skill coverage
- expected difficulty
- fallback strategy
- follow-up strategy

The interview plan is internal.

It is never shown to the candidate.

---

# Conversation Agent

## Purpose

Conduct the interview.

This is the only component responsible for talking to the candidate.

Responsibilities

- ask questions
- understand answers
- ask follow-up questions
- clarify responses
- challenge assumptions
- request examples
- give hints when appropriate
- maintain professional tone
- adapt difficulty
- detect incomplete answers
- determine when topic is complete

The Conversation Agent never calculates scores.

It never parses resumes.

It never stores memory.

Those responsibilities belong elsewhere.

---

# Evaluation Agent

The evaluator runs continuously.

Instead of waiting until the interview ends,
every answer is evaluated immediately.

Evaluation dimensions include:

- Technical Knowledge
- Communication
- Confidence
- Problem Solving
- Depth of Understanding
- System Design
- Behavioral Competency
- Leadership
- Accuracy
- Clarity

The evaluator continuously updates the interview score.

At interview completion it produces:

- overall score
- category scores
- strengths
- weaknesses
- evidence
- improvement plan
- hiring recommendation

---

# Reflection Agent

Purpose

Review interview quality.

The Reflection Agent periodically asks:

Did we accomplish the interview objectives?

Did we spend too much time on one topic?

Should the next topic change?

Did the candidate struggle?

Should difficulty increase?

Should hints be given?

The Reflection Agent improves interview flow.

---

# Tool Calling Layer

The Conversation Agent should never contain business logic.

Whenever external knowledge or computation is required,
it calls tools.

Tools return structured outputs.

---

# Core Tools

## Resume Analyzer

Input

Resume

Output

Structured candidate profile

Responsibilities

- extract skills
- projects
- experience
- education
- technologies
- achievements

---

## Job Description Analyzer

Extract

- responsibilities
- required skills
- preferred skills
- technologies
- seniority
- keywords

---

## Candidate Profiler

Combines

Resume

Job Description

User Profile

Produces

Candidate Context

---

## Interview Planner Tool

Generates interview plan.

---

## Question Generator

Generates the next interview question.

Inputs

Current topic

Previous answer

Difficulty

Interview objectives

Conversation history

Outputs

Question

Expected evaluation criteria

---

## Follow-up Generator

Purpose

Generate intelligent follow-up questions.

Example

Candidate:

"I used Redis."

↓

Follow-up

Why Redis?

↓

Candidate answers.

↓

What eviction policy?

↓

Why not Memcached?

↓

How would it scale?

Questions emerge naturally instead of from a predefined list.

---

## Topic Manager

Determines

- continue topic
- switch topic
- revisit topic
- skip topic

---

## Difficulty Controller

Inputs

Candidate performance

Confidence

Answer quality

Interview progress

Outputs

Difficulty adjustment

Possible values

Easy

Medium

Hard

Expert

---

## Transcript Manager

Stores

timestamp

speaker

utterance

metadata

confidence

---

## Session Memory Tool

Maintains interview memory.

Tracks

topics covered

questions asked

candidate mistakes

candidate strengths

unanswered questions

evaluation progress

The LLM never remembers anything by itself.

Everything is loaded from Session Memory.

---

## Knowledge Retrieval Tool

Retrieves technical knowledge.

May search

internal interview database

company interview style

question bank

documentation

RAG index

---

## Hint Generator

Generates hints only when enabled.

Hints should never reveal answers.

---

## Feedback Generator

Produces

strengths

weaknesses

examples

recommendations

learning roadmap

---

# Memory Architecture

The system uses multiple memory layers.

## Working Memory

Current conversation

Current topic

Recent answers

Short-lived.

---

## Session Memory

Entire interview.

Topics.

Scores.

Mistakes.

Follow-ups.

Objectives.

Persists until interview ends.

---

## Long-Term Memory

Historical interviews.

Improvement trends.

Past weaknesses.

Preferred interview settings.

Accessible across sessions.

---

# State Machine

Interview lifecycle

Created

↓

Preparing

↓

Planning

↓

Introduction

↓

Interview

↓

Follow-up

↓

Wrap-up

↓

Evaluation

↓

Completed

↓

Archived

Transitions are deterministic.

Agents do not change states.

Only the orchestrator changes states.

---

# Event System

Important events

InterviewStarted

TopicChanged

QuestionGenerated

AnswerReceived

ToolCalled

ScoreUpdated

DifficultyChanged

HintGenerated

TranscriptSaved

InterviewCompleted

EvaluationGenerated

Events make the architecture observable.

---

# AI Model Responsibilities

The language model is responsible for:

- conversation
- reasoning
- follow-up generation
- clarification
- explanation
- summarization
- natural language generation

The language model is NOT responsible for:

- authentication
- database operations
- scoring algorithms
- transcript persistence
- state management
- orchestration
- analytics
- authorization
- business logic

---

# Structured Outputs

Every agent should return structured outputs.

Avoid free-form parsing whenever possible.

Example

Question

Reason

Expected Skill

Difficulty

Topic

Evaluation Criteria

Follow-up Candidates

This reduces hallucinations and simplifies orchestration.

---

# Observability

Every AI invocation should record:

- latency
- tokens
- cost
- tool usage
- model version
- retry count
- errors

This enables debugging and optimization.

---

# Guiding Principle

The interview should emerge from collaboration between specialized components rather than from one enormous prompt.

The language model provides reasoning and conversation.

The application provides structure, memory, planning, tools, persistence, and deterministic behavior.

Together they create an interview experience that feels adaptive, consistent, and human.