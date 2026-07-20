# Real-time Communication

## Purpose

Real-time Communication enables live voice conversations between the candidate and the AI interviewer.

It allows both sides to speak naturally with low latency and supports interruptions during the interview.

---

# Technology

- WebRTC for real-time audio streaming
- Fastify for session management
- Streaming AI responses

---

# Communication Flow

Candidate Voice
        │
        ▼
WebRTC
        │
        ▼
AI Conversation
        │
        ▼
WebRTC
        │
        ▼
AI Voice Response

---

# Features

- Real-time voice streaming
- Low latency communication
- Two-way interruptions (barge-in)
- Live transcript updates
- Automatic reconnection on connection loss

---

# Responsibilities

Frontend

- Capture microphone audio
- Play AI audio
- Display live transcript
- Manage WebRTC connection

Backend

- Authenticate users
- Create interview sessions
- Manage interview state
- Store transcripts and events
- Coordinate AI services

---

# Design Goals

- Fast response time
- Stable connection
- Natural conversation
- Reliable streaming
- Seamless user experience