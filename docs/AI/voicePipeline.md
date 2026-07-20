# Voice Pipeline

## Purpose

The Voice Pipeline enables real-time voice conversations between the candidate and the AI interviewer.

It converts the candidate's speech into text, allows the AI to reason about the response, and converts the AI's reply back into speech.

The conversation should feel natural, with support for interruptions and low latency.

---

# Voice Flow

Candidate Speaks
        │
        ▼
Speech-to-Text (STT)
        │
        ▼
Conversation Agent
        │
        ▼
Tool Calls (if needed)
        │
        ▼
AI Response
        │
        ▼
Text-to-Speech (TTS)
        │
        ▼
Candidate Hears Response

---

# Components

## 1. Speech-to-Text (STT)

Responsibilities

- Convert user voice into text
- Stream partial transcripts
- Detect when the user starts and stops speaking

Output

- Transcript
- Confidence score

---

## 2. Conversation Agent

Responsibilities

- Read the transcript
- Understand the candidate's answer
- Ask follow-up questions
- Decide whether to call tools
- Generate the next response

The Conversation Agent is the brain of the interview.

---

## 3. Tool Layer

The AI can call tools when needed.

Examples

- Resume Analyzer
- Job Description Analyzer
- Session Memory
- Knowledge Retrieval

Tools return structured data to the Conversation Agent.

---

## 4. Text-to-Speech (TTS)

Responsibilities

- Convert AI response into natural speech
- Stream audio back to the user
- Stop speaking if interrupted

---

# Interruptions

The interview should support two-way interruptions.

Candidate interrupts AI

- Stop AI speech immediately
- Listen to the candidate
- Continue the conversation naturally

AI interrupts Candidate

- Only when appropriate
- Ask for clarification
- Redirect off-topic conversations
- Keep the interview on schedule

Interruptions should feel natural, not abrupt.

---

# Session Memory

During the interview, the AI remembers:

- Questions already asked
- Candidate answers
- Current topic
- Interview progress
- Strengths and weaknesses

Memory helps avoid repeating questions and enables better follow-up questions.

---

# Error Handling

If speech recognition fails:

- Ask the candidate to repeat.

If AI generation fails:

- Retry once.
- If it still fails, show a friendly error message.

If the connection is lost:

- Pause the interview.
- Allow the candidate to reconnect.

---

# Design Goals

- Low latency
- Natural conversation
- Streaming audio
- Support interruptions
- Reliable speech recognition
- Modular architecture