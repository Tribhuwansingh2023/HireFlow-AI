"""
HireFlow AI — Public API surface for the AI brain package.
"""
from backend.ai.agents.screening_agent import parse_resume, screen_resume
from backend.ai.agents.ranking_agent import rank_candidates
from backend.ai.agents.mock_services import (
    generate_interview_slots,
    generate_google_meet_link,
    generate_interview_questions,
    draft_email,
)
from backend.ai.scoring import score_candidate, composite_score, dedupe_key
from backend.ai.workflow import create_hireflow_graph, run_hireflow_workflow
from backend.ai.schemas import (
    ParsedProfile,
    ScreeningResult,
    RankingResult,
    CandidateRankItem,
    InterviewQuestionsResult,
    InterviewQuestion,
    EmailDraft,
    JobDescription,
    HireFlowState,
    ScoreComponent,
    ScoreBreakdown,
)

__all__ = [
    # Agents
    "parse_resume",
    "screen_resume",
    "rank_candidates",
    "generate_interview_slots",
    "generate_google_meet_link",
    "generate_interview_questions",
    "draft_email",
    # Scoring
    "score_candidate",
    "composite_score",
    "dedupe_key",
    # Workflow
    "create_hireflow_graph",
    "run_hireflow_workflow",
    # Schemas
    "ParsedProfile",
    "ScreeningResult",
    "RankingResult",
    "CandidateRankItem",
    "InterviewQuestionsResult",
    "InterviewQuestion",
    "EmailDraft",
    "JobDescription",
    "HireFlowState",
    "ScoreComponent",
    "ScoreBreakdown",
]
