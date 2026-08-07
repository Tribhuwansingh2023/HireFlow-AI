"""
HireFlow AI — Pydantic schemas aligned with the Lovable frontend Supabase types.

These models mirror the frontend's `types.ts` (Supabase auto-generated types),
`agents.functions.ts` (ParsedProfile Zod schema), and `scoring.ts` (ScoreBreakdown).
"""
from typing import List, Optional, Dict, Any, TypedDict
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# 1. Resume Parsing — mirrors frontend `ParsedProfile` Zod schema
# ---------------------------------------------------------------------------

class EducationItem(BaseModel):
    degree: str = Field(default="", description="Degree or qualification")
    institution: str = Field(default="", description="University / institution")
    year: str = Field(default="", description="Graduation year or study period")


class WorkHistoryItem(BaseModel):
    title: str = Field(default="", description="Job title")
    company: str = Field(default="", description="Company name")
    period: str = Field(default="", description="Employment period, e.g. 2021-2023")
    highlights: str = Field(default="", description="Key achievements summary")


class ProfileLinks(BaseModel):
    linkedin: str = Field(default="")
    github: str = Field(default="")
    portfolio: str = Field(default="")


class ParsedProfile(BaseModel):
    """Mirrors the frontend Zod `ParsedProfile` schema exactly."""
    full_name: str = Field(default="Unnamed candidate")
    email: str = Field(default="")
    phone: str = Field(default="")
    location: str = Field(default="")
    headline: str = Field(default="")
    years_experience: float = Field(default=0)
    skills: List[str] = Field(default_factory=list)
    education: List[EducationItem] = Field(default_factory=list)
    work_history: List[WorkHistoryItem] = Field(default_factory=list)
    links: ProfileLinks = Field(default_factory=ProfileLinks)


# ---------------------------------------------------------------------------
# 2. Scoring — mirrors frontend `scoring.ts` ScoreComponent / ScoreBreakdown
# ---------------------------------------------------------------------------

class ScoreComponent(BaseModel):
    key: str = Field(description="Component key: required_skills, experience, nice_to_have, education, location")
    label: str = Field(description="Human label for the component")
    weight: float = Field(description="Weight (0-1) for this scoring dimension")
    score: int = Field(description="Score 0-100 for this dimension")
    rationale: str = Field(description="Explanation for this score")


class ScoreBreakdown(BaseModel):
    components: List[ScoreComponent] = Field(default_factory=list)
    matched: List[str] = Field(default_factory=list, description="Skills matched")
    missing: List[str] = Field(default_factory=list, description="Skills missing")


# ---------------------------------------------------------------------------
# 3. Screening Result — mirrors frontend `applications` table columns
# ---------------------------------------------------------------------------

class ScreeningAnalysis(BaseModel):
    summary: str = Field(default="")
    recommendation: str = Field(default="hold", description="One of: advance, hold, reject")
    confidence: float = Field(default=0.5, ge=0, le=1)
    strengths: List[str] = Field(default_factory=list)
    risks: List[str] = Field(default_factory=list)
    bias_notes: Dict[str, Any] = Field(default_factory=dict)


class ScreeningResult(BaseModel):
    """Output shape matching application table update in the frontend."""
    match_score: int = Field(description="Overall match score 0-100")
    score_breakdown: Dict[str, Any] = Field(default_factory=dict)
    matched_skills: List[str] = Field(default_factory=list)
    missing_skills: List[str] = Field(default_factory=list)
    ai_summary: str = Field(default="")
    ai_recommendation: str = Field(default="hold")
    ai_confidence: float = Field(default=0.5)
    bias_notes: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# 4. Ranking — ordered candidate list with breakdown
# ---------------------------------------------------------------------------

class CandidateRankItem(BaseModel):
    candidate_id: Optional[str] = None
    candidate_name: str = Field(default="")
    rank: int = Field(description="Rank position, 1 = best")
    total_score: int = Field(description="Weighted composite score 0-100")
    matched_skills: List[str] = Field(default_factory=list)
    missing_skills: List[str] = Field(default_factory=list)
    key_strengths: List[str] = Field(default_factory=list)
    areas_of_concern: List[str] = Field(default_factory=list)
    reason: str = Field(default="", description="AI explanation for this ranking")


class RankingResult(BaseModel):
    job_title: str = Field(default="")
    rankings: List[CandidateRankItem] = Field(default_factory=list)
    summary: str = Field(default="")


# ---------------------------------------------------------------------------
# 5. Interview Questions — mirrors frontend question generation
# ---------------------------------------------------------------------------

class InterviewQuestion(BaseModel):
    question: str
    competency: str = Field(default="")
    why: str = Field(default="", description="Why this question for this candidate")
    signal: str = Field(default="", description="What a strong answer demonstrates")


class InterviewQuestionsResult(BaseModel):
    questions: List[InterviewQuestion] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# 6. Email Drafts — mirrors frontend `emails` table
# ---------------------------------------------------------------------------

class EmailDraft(BaseModel):
    kind: str = Field(description="Email kind: interview_invitation, offer_letter, rejection, follow_up")
    to_email: Optional[str] = None
    subject: str = Field(default="")
    body: str = Field(default="")
    template_name: Optional[str] = None
    variables: Dict[str, str] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# 7. Job Description — mirrors frontend `jobs` table
# ---------------------------------------------------------------------------

class JobDescription(BaseModel):
    id: Optional[str] = None
    title: str = Field(default="")
    description: str = Field(default="")
    required_skills: List[str] = Field(default_factory=list)
    nice_to_have_skills: List[str] = Field(default_factory=list)
    min_experience_years: int = Field(default=0)
    seniority: Optional[str] = None
    location: Optional[str] = None
    employment_type: str = Field(default="full_time")
    department: Optional[str] = None
    interview_rounds: int = Field(default=3)


# ---------------------------------------------------------------------------
# 8. LangGraph Workflow State
# ---------------------------------------------------------------------------

class HireFlowState(TypedDict, total=False):
    # Job context
    job: Dict[str, Any]

    # Candidate data
    candidate_id: Optional[str]
    resume_text: str
    resume_file_name: str
    parsed_profile: Optional[Dict[str, Any]]

    # Screening output
    screening_result: Optional[Dict[str, Any]]

    # Ranking (multi-candidate)
    all_candidates: Optional[List[Dict[str, Any]]]
    ranking_result: Optional[Dict[str, Any]]

    # HR Approval
    hr_approved: bool
    hr_comments: Optional[str]

    # Interview
    interview_slots: Optional[List[str]]
    interview_questions: Optional[Dict[str, Any]]

    # Communication
    email_drafts: Optional[List[Dict[str, Any]]]

    # Pipeline status
    status: str
    error: Optional[str]
