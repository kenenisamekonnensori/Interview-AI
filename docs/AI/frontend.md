# Frontend Architecture

## Purpose

The frontend provides a responsive and intuitive interface for users to manage interviews, participate in AI voice interviews, and review their performance.

It communicates with the backend through REST APIs and real-time communication.

---

# Architecture

The frontend is organized by feature rather than by page.

Features include:

- Authentication
- Dashboard
- Candidate Profile
- Resume
- Job Description
- Interview
- Reports
- Settings

Each feature manages its own components, hooks, and API calls.

---

# Main Pages

- Dashboard
- Create Interview
- Interview Session
- Interview Report
- Interview History
- Candidate Profile
- Settings

---

# State Management

The frontend should separate state into:

- Server State (API data)
- UI State (dialogs, loading, forms)
- Interview State (current interview session)

---

# API Communication

REST APIs

Used for:

- Authentication
- Profile
- Resume
- Job Description
- Interview management
- Reports

Real-time Communication

Used for:

- Voice streaming
- Live transcripts
- AI responses
- Interview events

---

# File Upload

Users can upload:

- Resume (PDF, DOCX)
- Job Description (PDF, DOCX, Text)

Uploads should display:

- Upload progress
- Processing status
- Error handling

---

# Interview Experience

During an interview, the UI should display:

- AI speaking status
- User speaking status
- Live transcript
- Current interview status
- Timer
- Connection status

---

# Error Handling

The application should:

- Display friendly error messages
- Handle network failures gracefully
- Allow interview reconnection
- Show loading and processing states

---

# Design Goals

- Fast and responsive
- Simple and intuitive
- Mobile-friendly
- Accessible
- Consistent user experience