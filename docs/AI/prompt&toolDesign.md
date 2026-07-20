# Prompt & Tool Design

## Purpose

The AI Interview Platform uses small, specialized prompts and tool calling instead of one large prompt.

Prompts define the AI's behavior, while tools provide data and perform business logic.

---

# Prompt Design Principles

- Keep prompts short and focused
- Give the AI a clear role
- Use tool calling for external data
- Use structured outputs when possible
- Keep business logic in code, not prompts

---

# Core Prompts

## System Prompt

Defines the AI's identity and behavior.

Responsibilities

- Act as a professional interviewer
- Maintain a natural conversation
- Ask relevant follow-up questions
- Stay on the current interview topic
- Never reveal internal reasoning

---

## Planning Prompt

Used before the interview starts.

Responsibilities

- Review candidate information
- Review resume and job description
- Generate an interview plan
- Select interview topics
- Determine question order

---

## Evaluation Prompt

Used after each answer and at the end of the interview.

Responsibilities

- Evaluate the candidate's response
- Identify strengths and weaknesses
- Generate constructive feedback
- Produce structured scores

---

# Tool Design

Each tool should perform one specific task.

Tools should return structured data instead of natural language.

---

# Core Tools

### Resume Analyzer

- Extract skills
- Extract experience
- Extract projects

---

### Job Description Analyzer

- Extract required skills
- Identify responsibilities
- Determine interview focus

---

### Session Memory

- Store interview progress
- Track answered questions
- Remember strengths and weaknesses

---

### Knowledge Retrieval

- Retrieve technical concepts
- Retrieve company-specific interview information
- Provide supporting context

---

### Feedback Generator

- Generate final feedback
- Generate improvement suggestions
- Produce learning roadmap

---

# Tool Calling Flow

Conversation Agent

↓

Determine if a tool is needed

↓

Call Tool

↓

Receive structured result

↓

Generate response

---

# Design Goals

- Small prompts
- Modular tools
- Clear responsibilities
- Reusable components
- Easy to maintain and extend