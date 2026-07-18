# Engineering Playbook

# Interviewer AI

Version: 1.0

---

# Purpose

This document defines how Interviewer AI should be implemented.

It is the operational guide for engineers and AI coding agents. Every implementation task should follow the principles, workflow, and quality standards described here.

The objective is not only to build features, but to build a codebase that remains understandable, maintainable, and extensible throughout the project's lifetime.

---

# Engineering Philosophy

Build software the way an experienced engineering team would.

Prioritize:

* Clarity over cleverness.
* Simplicity over unnecessary abstraction.
* Maintainability over short-term speed.
* Incremental progress over large rewrites.
* Explicit design over hidden behavior.

Every change should improve the codebase rather than simply add functionality.

---

# Development Workflow

Every task follows the same workflow.

### 1. Understand

Before writing code:

* Read the relevant design documents.
* Identify the owning module.
* Understand existing interfaces.
* Define the expected outcome.

Never begin implementation without understanding the surrounding architecture.

---

### 2. Plan

Before editing files:

* Identify affected modules.
* Minimize the scope of changes.
* Reuse existing abstractions.
* Avoid introducing new patterns unless necessary.

---

### 3. Implement

During implementation:

* Keep files focused.
* Keep functions small.
* Prefer composition over duplication.
* Follow existing conventions.
* Add types before logic.
* Validate external input.
* Handle failures explicitly.

---

### 4. Verify

Every completed task must:

* Build successfully.
* Pass linting.
* Pass relevant tests.
* Satisfy acceptance criteria.
* Avoid regressions.

Never leave the repository in a broken state.

---

# Module Ownership

Every feature belongs to exactly one module.

When implementing a feature:

1. Find the owning module.
2. Implement it there.
3. Expose only the required public interface.
4. Avoid leaking implementation details.

If ownership is unclear, resolve the architecture first rather than coding around it.

---

# AI Coding Agent Rules

An AI coding agent should never:

* Modify unrelated files.
* Introduce architectural shortcuts.
* Duplicate existing functionality.
* Bypass validation.
* Ignore project conventions.
* Add dependencies without justification.
* Invent undocumented behavior.

When uncertain, preserve the existing architecture and request clarification rather than making assumptions.

---

# Definition of Ready

A task is ready when:

* The objective is clearly defined.
* The owning module is known.
* Required dependencies already exist or are part of the task.
* Acceptance criteria are measurable.

---

# Definition of Done

A task is complete only when:

* The feature works as intended.
* Acceptance criteria are satisfied.
* Types are correct.
* Validation is implemented.
* Errors are handled.
* Tests pass.
* Documentation remains accurate.
* No unrelated code was changed.

---

# Pull Request Mindset

Every completed task should be small enough to imagine as a single pull request.

Each change should answer one question:

> "What capability does this introduce?"

If the answer contains multiple unrelated features, the task is too large.

---

# Architecture Preservation

The architecture defined in the project documents is the default.

Do not introduce new patterns without a clear technical reason.

When extending the system:

* Respect module boundaries.
* Reuse existing interfaces.
* Extend rather than replace.
* Keep dependencies flowing inward.

Consistency is more valuable than novelty.

---

# Code Quality Standards

Every implementation should aim for:

* Readable code.
* Explicit naming.
* Small functions.
* Small modules.
* Strong typing.
* Predictable behavior.
* Minimal side effects.

Code should explain itself through structure rather than comments.

---

# Error Handling

Every failure should:

* Be expected.
* Produce a meaningful error.
* Preserve application stability.
* Avoid exposing internal implementation details.

Unexpected errors should never silently fail.

---

# Testing Philosophy

Test behavior, not implementation.

Focus on:

* Business rules.
* Module boundaries.
* State transitions.
* API contracts.
* Critical user flows.

Tests should increase confidence, not simply increase coverage.

---

# Performance Philosophy

Optimize for responsiveness where users notice it most.

Prioritize:

* Fast page loads.
* Low-latency conversations.
* Efficient database access.
* Streaming responses.
* Smooth user interactions.

Avoid premature optimization elsewhere.

---

# Building with AI

Treat the AI coding agent as another engineer on the team.

Provide:

* Relevant context.
* Clear objectives.
* Architectural constraints.
* Acceptance criteria.

Review every implementation before moving to the next task.

The AI accelerates development but does not replace engineering judgment.

---

# Milestone Strategy

Complete one milestone at a time.

Do not begin a new milestone until the current one is:

* Functional.
* Tested.
* Stable.
* Integrated.

Working software is always more valuable than partially completed features.

---

# Final Principle

Every commit should leave the project in a better state than it was before.

Progress is measured not by the number of files changed, but by the quality, clarity, and completeness of the system being built.
