"""
HireFlow AI — LangGraph Multi-Agent Orchestration Workflow.

Graph:
  START → parse_resume → screen_candidate → rank_candidates
       → [HR Approval checkpoint]
           ├── approved → schedule_interview → generate_questions → draft_emails → END
           └── rejected → END
"""
from typing import Dict, Any
from langgraph.graph import StateGraph, START, END

from backend.ai.schemas import HireFlowState
from backend.ai.agents.screening_agent import parse_resume, screen_resume
from backend.ai.agents.ranking_agent import rank_candidates
from backend.ai.agents.mock_services import (
    generate_interview_slots,
    generate_google_meet_link,
    generate_interview_questions,
    draft_email,
)


# ---------------------------------------------------------------------------
# Node Functions
# ---------------------------------------------------------------------------

def parse_resume_node(state: HireFlowState) -> Dict[str, Any]:
    """Node 1: Parse resume text into structured profile."""
    resume_text = state.get("resume_text", "")
    file_name = state.get("resume_file_name", "resume.pdf")

    profile = parse_resume(resume_text, file_name)
    return {
        "parsed_profile": profile.model_dump(),
        "status": "parsed",
    }


def screen_candidate_node(state: HireFlowState) -> Dict[str, Any]:
    """Node 2: Screen candidate against job description."""
    job = state.get("job", {})
    resume_text = state.get("resume_text", "")
    file_name = state.get("resume_file_name", "resume.pdf")

    result = screen_resume(
        resume_source=resume_text,
        job=job,
        raw_resume_text=resume_text,
        file_name=file_name,
    )
    return {
        "parsed_profile": result["parsed_profile"],
        "screening_result": result,
        "status": "screened",
    }


def rank_candidates_node(state: HireFlowState) -> Dict[str, Any]:
    """Node 3: Rank candidates (single or multiple)."""
    job = state.get("job", {})
    screening = state.get("screening_result", {})
    all_cands = state.get("all_candidates") or []

    # If no batch candidates, use the single screening result
    if not all_cands and screening:
        profile = screening.get("parsed_profile", {})
        all_cands = [{
            "parsed_profile": profile,
            "candidate_name": profile.get("full_name", "Candidate"),
            "resume_text": state.get("resume_text", ""),
            "match_score": screening.get("match_score", 0),
            "matched_skills": screening.get("matched_skills", []),
            "missing_skills": screening.get("missing_skills", []),
        }]

    ranking = rank_candidates(all_cands, job)
    return {
        "ranking_result": {
            "job_title": ranking.job_title,
            "rankings": [r.model_dump() for r in ranking.rankings],
            "summary": ranking.summary,
        },
        "status": "ranked",
    }


def hr_approval_node(state: HireFlowState) -> Dict[str, Any]:
    """Node 4: Human-in-the-Loop checkpoint (auto-approve for demo)."""
    approved = state.get("hr_approved", True)
    return {
        "status": "hr_approved" if approved else "hr_rejected",
    }


def schedule_interview_node(state: HireFlowState) -> Dict[str, Any]:
    """Node 5: Mock interview scheduling."""
    slots = generate_interview_slots()
    meet_link = generate_google_meet_link()
    formatted_slots = [f"{slot} — {meet_link}" for slot in slots]
    return {
        "interview_slots": formatted_slots,
        "status": "scheduled",
    }


def generate_questions_node(state: HireFlowState) -> Dict[str, Any]:
    """Node 6: Generate tailored interview questions."""
    job = state.get("job", {})
    profile = state.get("parsed_profile") or {}
    screening = state.get("screening_result") or {}

    candidate_info = {
        **profile,
        "match_score": screening.get("match_score", "N/A"),
        "matched_skills": screening.get("matched_skills", []),
        "missing_skills": screening.get("missing_skills", []),
    }

    questions = generate_interview_questions(job, candidate_info)
    return {
        "interview_questions": {
            "questions": [q.model_dump() for q in questions.questions],
        },
        "status": "questions_generated",
    }


def draft_emails_node(state: HireFlowState) -> Dict[str, Any]:
    """Node 7: Draft interview invitation email."""
    profile = state.get("parsed_profile") or {}
    job = state.get("job", {})
    slots = state.get("interview_slots", [])
    candidate_name = profile.get("full_name", "Candidate")

    email = draft_email(
        kind="interview_invitation",
        candidate_name=candidate_name,
        job_title=job.get("title", "Position"),
        candidate_email=profile.get("email"),
        context=f"Suggested slot: {slots[0]}" if slots else "Slot TBD",
    )
    return {
        "email_drafts": [email.model_dump()],
        "status": "emails_drafted",
    }


# ---------------------------------------------------------------------------
# Conditional routing
# ---------------------------------------------------------------------------

def should_continue_after_approval(state: HireFlowState) -> str:
    if state.get("status") == "hr_approved":
        return "schedule_interview"
    return END


# ---------------------------------------------------------------------------
# Graph Construction
# ---------------------------------------------------------------------------

def create_hireflow_graph():
    """Build and compile the multi-agent LangGraph workflow."""
    workflow = StateGraph(HireFlowState)

    # Add nodes
    workflow.add_node("screen_candidate", screen_candidate_node)
    workflow.add_node("rank_candidates", rank_candidates_node)
    workflow.add_node("hr_approval", hr_approval_node)
    workflow.add_node("schedule_interview", schedule_interview_node)
    workflow.add_node("generate_questions", generate_questions_node)
    workflow.add_node("draft_emails", draft_emails_node)

    # Linear flow until HR approval
    workflow.add_edge(START, "screen_candidate")
    workflow.add_edge("screen_candidate", "rank_candidates")
    workflow.add_edge("rank_candidates", "hr_approval")

    # Conditional: approved → continue; rejected → end
    workflow.add_conditional_edges(
        "hr_approval",
        should_continue_after_approval,
        {"schedule_interview": "schedule_interview", END: END},
    )

    # Post-approval flow
    workflow.add_edge("schedule_interview", "generate_questions")
    workflow.add_edge("generate_questions", "draft_emails")
    workflow.add_edge("draft_emails", END)

    return workflow.compile()


def run_hireflow_workflow(initial_state: HireFlowState) -> Dict[str, Any]:
    """Execute the full multi-agent pipeline and return final state."""
    app = create_hireflow_graph()
    final_state = app.invoke(initial_state)
    return dict(final_state)
