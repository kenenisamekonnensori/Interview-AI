# Career Readiness & Analytics Architecture

## Purpose

This document defines the architectural specification for Interviewer AI's career readiness loop:
```text
Career Target → Interview Practice → Performance Evaluation → Skill Gap Analysis
→ Personalized Practice Plan → Reassessment → Job Readiness Score
```

It establishes domain models, calculation policies, API contracts, and Paddle subscription gating.

---

## 1. Domain Architecture

### Core Entities

```text
User
├── UserProfile                   # Preferences & interview defaults
├── Resume / JobDescription       # Uploaded career documents & AI extractions
├── CareerTarget                  # Active target role & required competencies
├── Interviews                    # Immutable mock interview sessions
│     └── InterviewReport         # Per-interview structured evaluation & rubric scores
├── SkillAnalysis                 # Aggregated skill strengths, weaknesses, and mastery levels
├── ReadinessSnapshot             # Historical 0–100 job readiness scores with factor breakdowns
├── PracticePlan                  # Structured preparation path
│     └── PracticePlanItem        # Actionable interview goals linked to completed sessions
└── Billing (Paddle)
      ├── BillingCustomer         # Paddle customer mapping
      ├── Subscription            # Active tier (FREE, PRO, ENTERPRISE) & status
      └── UsageRecord / Counter   # Period interview and AI token usage tracking
```

### Invariants & Rules

1. **Server-Authoritative**: Readiness scores, skill analyses, practice plans, and billing entitlements are computed exclusively by the API. The client only displays data.
2. **Immutable Interview History**: Completed interview reports and conversation turns are immutable. Changes to analytics algorithms do not rewrite past reports; derived metrics carry `version` and `computedAt`.
3. **Evidence-Based Scoring**: Every score stores its contributing factors, evidence turn references, and detected strengths/weaknesses. No black-box or fabricated percentages.
4. **Resilience**: If AI generation fails for a recommendation or practice plan, the system falls back to a deterministic recommendation based on the candidate's lowest-scoring skill area.

---

## 2. Readiness Calculation Engine

The **Job Readiness Score** (0–100) evaluates how prepared a candidate is for their active `CareerTarget`.

### Score Weighting

| Component | Weight | Source |
| :--- | :--- | :--- |
| **Performance Trends** | 40% | Average score across completed, valid interview reports for the target role |
| **Skill Coverage & Mastery** | 35% | Evaluated skill proficiencies mapped against the target's required technologies |
| **Practice Volume & Recency** | 15% | Recency decay penalty if no practice occurred in >14 days |
| **Consistency** | 10% | Low variance across multiple interview sessions and difficulty levels |

### Triggers for Snapshot Recomputation
- Completion of an interview and publication of an `InterviewReport`.
- Activation or update of a `CareerTarget`.
- Manual re-evaluation request (`POST /api/v1/analytics/readiness/recalculate`).

---

## 3. Practice Plan Lifecycle

A `PracticePlan` guides the user toward readiness through targeted practice sessions.

```text
ACTIVE -> COMPLETED | ARCHIVED
```

- Each plan contains an ordered sequence of `PracticePlanItem` goals (e.g. "Master distributed caching under load in System Design", "Improve STAR-method conciseness in Behavioral").
- Completing a recommended interview automatically advances the corresponding item status from `PENDING` to `COMPLETED`.
- At most one `ACTIVE` practice plan exists per user.

---

## 4. Subscription & Entitlement Architecture

Billing is powered by **Paddle** using the `@paddle/paddle-node-sdk`.

### Plan Tiers

| Tier | Monthly Interview Allowance | Analysis Level | Real-Time Voice |
| :--- | :--- | :--- | :--- |
| **FREE** | 2 interviews / month | Standard reports | Basic turn duration (15 min cap) |
| **PRO** | 20 interviews / month | Deep skill gap analysis & practice plan | Full voice duration (45 min cap), Priority LLM think chain |
| **ENTERPRISE**| Unlimited | Custom rubrics & team benchmarking | Full voice duration, Dedicated limits |

### Usage Metering & Enforcement
- Every session start checks active entitlements via `InterviewUsageService`.
- If an account exceeds its quota, `POST /api/v1/interviews` returns `403 FORBIDDEN` with code `USAGE_LIMIT_EXCEEDED` and an upgrade link.
- Webhooks from Paddle update `Subscription` records and reset monthly `UsageCounter` periods idempotently.
