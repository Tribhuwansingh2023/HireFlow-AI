# AI Agents & Skills

This document outlines the specialized agents and skills that power HireFlow AI.

## 1. Candidate Ranking Agent
- **Purpose**: Evaluates candidate resumes against the job description using deterministic rules and embedding similarity.
- **Role**: Automatically scores and ranks incoming applications, providing explainable rationale for its AI recommendations (Advance, Review, Reject).

## 2. Human Approval Agent (HITL)
- **Purpose**: Enforces human-in-the-loop (HITL) oversight between automated screening and downstream automated actions (like interview scheduling and email drafting).
- **Enforced Gates**: 
  - An application must be explicitly marked as `approved` by a human before the Interview Scheduler Agent can schedule a round or draft an interview invite.
  - A human can override the AI recommendation, modify the candidate's rank, and explicitly reject them.
  - Rejections and rank modifications require explicit typed HR comments, ensuring accountability.
  - All decisions are recorded immutably in the `approvals` ledger and the system audit trail.

## 3. Interview Scheduler Agent
- **Purpose**: Orchestrates the multi-round interview process, generates unique meeting links, and delegates question generation.
- **Rule**: Only operates on candidates that have passed the Human Approval Agent gate (i.e. `applications.status === 'approved'`).

## 4. Question Generator Agent
- **Purpose**: Dynamically generates tailored question guides for scheduled interviews, based on the job description and the candidate's specific resume and AI screening summary.
