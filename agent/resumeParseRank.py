"""
HireFlow AI — Resume Screening & Candidate Ranking Agent
=========================================================
A two-stage LangGraph pipeline:

  Stage 1 — Resume Screening Agent
    • Parses PDF / DOCX / TXT resumes
    • Extracts structured candidate profile via Gemini LLM
    • Compares profile against Job Description
    • Calculates match percentage & detects missing skills

  Stage 2 — Candidate Ranking Agent
    • Applies weighted scoring across all screened candidates
    • Ranking weights:
        Skill Match      40 %
        Experience       25 %
        Projects         15 %
        Certifications   10 %
        Education        10 %
    • Returns a sorted leaderboard with explanations

Usage
-----
  # CLI — rank multiple resumes against a JD
  python agent/resumeParseRank.py \\
      --jd "Senior Python Engineer with FastAPI, Postgres, Docker..." \\
      --resumes alice.pdf bob.docx john.txt sarah.pdf

  # Library
  from agent.resumeParseRank import run_pipeline
  results = run_pipeline(resume_paths=["alice.pdf"], job_description="...")

Requirements
------------
  pip install -r agent/requirements.txt
  export GOOGLE_API_KEY="your-key-here"
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from io import BytesIO
from pathlib import Path
from typing import Any, Annotated, Sequence, TypedDict

from dotenv import load_dotenv

# ── LangChain / LangGraph ──────────────────────────────────────────────────────
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, BaseMessage
from langchain_core.tools import tool
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field

# ── Resume parsers ─────────────────────────────────────────────────────────────
try:
    from pypdf import PdfReader
    _HAS_PYPDF = True
except ImportError:
    _HAS_PYPDF = False

try:
    import docx as python_docx
    _HAS_DOCX = True
except ImportError:
    _HAS_DOCX = False

# ──────────────────────────────────────────────────────────────────────────────
# Environment
# ──────────────────────────────────────────────────────────────────────────────

load_dotenv()

def _get_llm() -> ChatGroq:
    """Return a configured Groq LLM instance.

    Model options (override via GROQ_MODEL env var):
      llama-3.3-70b-versatile   — best quality, great for JSON (default)
      llama-3.1-8b-instant      — fastest, lower latency
      mixtral-8x7b-32768        — large context window
      gemma2-9b-it              — lightweight alternative

    Requires GROQ_API_KEY in environment or .env file.
    Get a free key at: https://console.groq.com
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise EnvironmentError(
            "GROQ_API_KEY is not set.\n"
            "  export GROQ_API_KEY='your-key-here'\n"
            "  or add GROQ_API_KEY=... to a .env file in the project root.\n"
            "  Get a free key at: https://console.groq.com"
        )
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    return ChatGroq(
        model=model,
        groq_api_key=api_key,
        temperature=0.1,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic output schemas
# ──────────────────────────────────────────────────────────────────────────────

class Education(BaseModel):
    degree: str = Field(description="Degree or qualification name")
    institution: str = Field(description="University or institution name")
    year: str = Field(description="Graduation year or period")
    field: str = Field(default="", description="Field of study")


class WorkExperience(BaseModel):
    title: str = Field(description="Job title")
    company: str = Field(description="Company name")
    period: str = Field(description="Employment period, e.g. 'Jan 2021 – Dec 2023'")
    duration_months: int = Field(default=0, description="Duration in months (estimated)")
    highlights: str = Field(description="Key responsibilities and achievements")


class Project(BaseModel):
    name: str = Field(description="Project name")
    description: str = Field(description="What the project does")
    tech_stack: list[str] = Field(default_factory=list, description="Technologies used")
    impact: str = Field(default="", description="Measurable impact or outcome")


class CandidateProfile(BaseModel):
    """Structured candidate profile extracted by the Screening Agent."""
    full_name: str = Field(description="Candidate's full name")
    email: str = Field(default="", description="Email address")
    phone: str = Field(default="", description="Phone number")
    location: str = Field(default="", description="Location / city")
    headline: str = Field(default="", description="Professional headline or summary")

    skills: list[str] = Field(default_factory=list, description="All technical and soft skills")
    years_experience: float = Field(default=0.0, description="Total years of professional experience")

    work_history: list[WorkExperience] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list, description="Professional certifications")
    projects: list[Project] = Field(default_factory=list)
    achievements: list[str] = Field(default_factory=list, description="Noteworthy achievements & awards")

    # JD comparison — populated by the screening step
    matched_skills: list[str] = Field(default_factory=list, description="Skills matching the JD")
    missing_skills: list[str] = Field(default_factory=list, description="Required skills absent from resume")
    match_percentage: float = Field(default=0.0, description="Overall JD match percentage (0–100)")
    candidate_summary: str = Field(default="", description="AI-generated recruiter summary")


class ScoreComponent(BaseModel):
    criterion: str
    weight: float          # 0.0 – 1.0
    raw_score: float       # 0 – 100
    weighted_score: float  # raw_score * weight
    rationale: str


class RankedCandidate(BaseModel):
    rank: int
    name: str
    source_file: str
    total_score: float
    components: list[ScoreComponent]
    profile: CandidateProfile


# ──────────────────────────────────────────────────────────────────────────────
# LangGraph State
# ──────────────────────────────────────────────────────────────────────────────

class AgentState(TypedDict):
    """State that flows through every node in the LangGraph pipeline."""
    # Inputs
    job_description: str
    resume_paths: list[str]

    # Intermediate — keyed by file path
    raw_texts: dict[str, str]              # file_path → raw text
    profiles: dict[str, CandidateProfile]  # file_path → structured profile

    # Output
    ranked_candidates: list[RankedCandidate]

    # Message log (for debugging / tracing)
    messages: Annotated[Sequence[BaseMessage], add_messages]


# ──────────────────────────────────────────────────────────────────────────────
# Tool definitions (used by LangChain agent steps)
# ──────────────────────────────────────────────────────────────────────────────

@tool
def extract_pdf_text(file_path: str) -> str:
    """Extract plain text from a PDF resume file."""
    if not _HAS_PYPDF:
        raise ImportError("pypdf is not installed. Run: pip install pypdf")
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    reader = PdfReader(str(path))
    pages_text = []
    for page in reader.pages:
        text = page.extract_text() or ""
        pages_text.append(text)
    return "\n\n".join(pages_text).strip()


@tool
def extract_docx_text(file_path: str) -> str:
    """Extract plain text from a DOCX resume file."""
    if not _HAS_DOCX:
        raise ImportError("python-docx is not installed. Run: pip install python-docx")
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    doc = python_docx.Document(str(path))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs).strip()


@tool
def extract_txt_text(file_path: str) -> str:
    """Extract plain text from a TXT or MD resume file."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    return path.read_text(encoding="utf-8", errors="replace").strip()


# ──────────────────────────────────────────────────────────────────────────────
# Helper: extract text from any supported file
# ──────────────────────────────────────────────────────────────────────────────

def _extract_text(file_path: str) -> str:
    """Dispatch to the correct extractor based on file extension."""
    ext = Path(file_path).suffix.lower()
    if ext == ".pdf":
        return extract_pdf_text.invoke({"file_path": file_path})
    if ext == ".docx":
        return extract_docx_text.invoke({"file_path": file_path})
    if ext in (".txt", ".md"):
        return extract_txt_text.invoke({"file_path": file_path})
    raise ValueError(
        f"Unsupported file type '{ext}'. Supported: .pdf, .docx, .txt, .md"
    )


# ──────────────────────────────────────────────────────────────────────────────
# Node 1 — Parse Resume (extract raw text from all files)
# ──────────────────────────────────────────────────────────────────────────────

def parse_resume_node(state: AgentState) -> AgentState:
    """
    Resume Parsing Node
    -------------------
    Reads every resume file and extracts raw text.
    Populates state['raw_texts'].
    """
    raw_texts: dict[str, str] = {}
    log_msgs: list[str] = []

    for path in state["resume_paths"]:
        try:
            text = _extract_text(path)
            raw_texts[path] = text
            log_msgs.append(f"[OK] Extracted {len(text):,} chars from '{Path(path).name}'")
        except Exception as exc:
            raw_texts[path] = ""
            log_msgs.append(f"[FAIL] Could not extract '{Path(path).name}': {exc}")

    summary = "\n".join(log_msgs)
    return {
        **state,
        "raw_texts": raw_texts,
        "messages": [AIMessage(content=f"[parse_resume_node]\n{summary}")],
    }


# ──────────────────────────────────────────────────────────────────────────────
# Node 2 — Screen Candidate (LLM extraction + JD comparison)
# ──────────────────────────────────────────────────────────────────────────────

_SCREENING_SYSTEM_PROMPT = """You are an expert HR analyst and resume parser for HireFlow AI.

Your task has TWO parts:

PART 1 — EXTRACT a structured candidate profile from the resume text.
PART 2 — COMPARE the candidate against the Job Description.

Always respond with a single valid JSON object (no markdown, no preamble) matching this schema:

{
  "full_name": "string",
  "email": "string",
  "phone": "string",
  "location": "string",
  "headline": "string (professional summary, 1-2 sentences)",
  "skills": ["list of technical and soft skills"],
  "years_experience": number,
  "work_history": [
    {
      "title": "string",
      "company": "string",
      "period": "string",
      "duration_months": number,
      "highlights": "string"
    }
  ],
  "education": [
    {
      "degree": "string",
      "institution": "string",
      "year": "string",
      "field": "string"
    }
  ],
  "certifications": ["list of certifications"],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "tech_stack": ["list"],
      "impact": "string"
    }
  ],
  "achievements": ["list of achievements and awards"],
  "matched_skills": ["skills from JD that the candidate HAS"],
  "missing_skills": ["skills from JD that the candidate LACKS"],
  "match_percentage": number (0-100, how well this candidate matches the JD),
  "candidate_summary": "string (recruiter-facing summary: strengths, fit, gaps)"
}

Rules:
- Be precise. Only list skills explicitly mentioned or strongly implied by context.
- match_percentage must reflect hard evidence: required skills found, experience level, education alignment.
- missing_skills must list JD requirements NOT found in the resume.
- candidate_summary must be 3-5 sentences: start with the candidate name, key strengths, years of experience, fit for the role, and notable gaps.
"""


def _parse_json_response(raw: str) -> dict[str, Any]:
    """Tolerant JSON parser — strips markdown fences if present."""
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    # Find the outermost JSON object
    start = cleaned.find("{")
    end = cleaned.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON object found in LLM response.")
    return json.loads(cleaned[start:end])


def _screen_single_candidate(
    llm: ChatGroq,
    resume_text: str,
    job_description: str,
    file_name: str,
) -> CandidateProfile:
    """Run the LLM screening step for a single candidate."""
    user_content = (
        f"=== JOB DESCRIPTION ===\n{job_description}\n\n"
        f"=== RESUME: {file_name} ===\n{resume_text[:20000]}"
    )

    messages = [
        SystemMessage(content=_SCREENING_SYSTEM_PROMPT),
        HumanMessage(content=user_content),
    ]

    response = llm.invoke(messages)
    raw = response.content if isinstance(response.content, str) else str(response.content)

    try:
        data = _parse_json_response(raw)
    except (json.JSONDecodeError, ValueError) as exc:
        raise ValueError(
            f"LLM returned unparseable JSON for '{file_name}': {exc}\n"
            f"Raw response (first 500 chars): {raw[:500]}"
        ) from exc

    # Safely build sub-models
    def safe_list(key: str, cls: type) -> list:
        items = data.get(key) or []
        result = []
        for item in items:
            try:
                result.append(cls(**item) if isinstance(item, dict) else item)
            except Exception:
                pass
        return result

    profile = CandidateProfile(
        full_name=str(data.get("full_name") or file_name),
        email=str(data.get("email") or ""),
        phone=str(data.get("phone") or ""),
        location=str(data.get("location") or ""),
        headline=str(data.get("headline") or ""),
        skills=[str(s) for s in (data.get("skills") or [])],
        years_experience=float(data.get("years_experience") or 0),
        work_history=safe_list("work_history", WorkExperience),
        education=safe_list("education", Education),
        certifications=[str(c) for c in (data.get("certifications") or [])],
        projects=safe_list("projects", Project),
        achievements=[str(a) for a in (data.get("achievements") or [])],
        matched_skills=[str(s) for s in (data.get("matched_skills") or [])],
        missing_skills=[str(s) for s in (data.get("missing_skills") or [])],
        match_percentage=float(data.get("match_percentage") or 0),
        candidate_summary=str(data.get("candidate_summary") or ""),
    )
    return profile


def screen_candidate_node(state: AgentState) -> AgentState:
    """
    Candidate Screening Node
    ------------------------
    For each resume with extracted text, calls the LLM to:
      • Extract structured fields
      • Compare against the Job Description
      • Calculate match percentage & identify missing skills
      • Generate a recruiter summary
    Populates state['profiles'].
    """
    llm = _get_llm()
    profiles: dict[str, CandidateProfile] = {}
    log_msgs: list[str] = []

    for path, text in state["raw_texts"].items():
        file_name = Path(path).name
        if not text.strip():
            log_msgs.append(f"[SKIP] '{file_name}' — no text extracted")
            continue
        try:
            profile = _screen_single_candidate(llm, text, state["job_description"], file_name)
            profiles[path] = profile
            log_msgs.append(
                f"[OK] Screened '{file_name}': {profile.full_name} | "
                f"Match: {profile.match_percentage:.0f}% | "
                f"Skills: {len(profile.matched_skills)}/{len(profile.matched_skills) + len(profile.missing_skills)}"
            )
        except Exception as exc:
            log_msgs.append(f"[FAIL] Screening '{file_name}': {exc}")

    summary = "\n".join(log_msgs)
    return {
        **state,
        "profiles": profiles,
        "messages": [AIMessage(content=f"[screen_candidate_node]\n{summary}")],
    }


# ──────────────────────────────────────────────────────────────────────────────
# Node 3 — Rank Candidates (weighted scoring engine)
# ──────────────────────────────────────────────────────────────────────────────

# Scoring weights — must sum to 1.0
SCORING_WEIGHTS = {
    "skill_match":    0.40,   # 40 %
    "experience":     0.25,   # 25 %
    "projects":       0.15,   # 15 %
    "certifications": 0.10,   # 10 %
    "education":      0.10,   # 10 %
}


def _score_skill_match(profile: CandidateProfile) -> tuple[float, str]:
    """Score 0-100 based on JD skill coverage."""
    total = len(profile.matched_skills) + len(profile.missing_skills)
    if total == 0:
        # Fall back to match_percentage from LLM if no skill breakdown
        return profile.match_percentage, "JD skill breakdown unavailable — using LLM match estimate."
    score = (len(profile.matched_skills) / total) * 100
    rationale = (
        f"{len(profile.matched_skills)} of {total} required skills matched. "
        f"Missing: {', '.join(profile.missing_skills[:5]) or 'none'}."
    )
    return round(score, 1), rationale


def _score_experience(profile: CandidateProfile) -> tuple[float, str]:
    """Score 0-100 based on years of experience (soft cap at 10 years → 100)."""
    years = profile.years_experience
    if years <= 0:
        return 20.0, "No experience information extracted."
    if years >= 10:
        score = 100.0
    elif years >= 7:
        score = 85.0 + (years - 7) * 5
    elif years >= 4:
        score = 65.0 + (years - 4) * 6.67
    elif years >= 1:
        score = 30.0 + (years - 1) * 11.67
    else:
        score = max(10.0, years * 30)
    rationale = f"{years:.1f} years of professional experience."
    return round(score, 1), rationale


def _score_projects(profile: CandidateProfile) -> tuple[float, str]:
    """Score 0-100 based on number and quality of projects."""
    count = len(profile.projects)
    if count == 0:
        return 20.0, "No projects listed on resume."
    # Base score for having projects, bonus for quantity & impact
    has_impact = sum(1 for p in profile.projects if p.impact.strip())
    base = min(100, 40 + count * 15)
    impact_bonus = min(20, has_impact * 8)
    score = min(100, base + impact_bonus)
    rationale = (
        f"{count} project(s) found; {has_impact} with measurable impact/outcome."
    )
    return round(score, 1), rationale


def _score_certifications(profile: CandidateProfile) -> tuple[float, str]:
    """Score 0-100 based on professional certifications."""
    count = len(profile.certifications)
    if count == 0:
        return 30.0, "No certifications listed."
    score = min(100, 50 + count * 20)
    rationale = f"{count} certification(s): {', '.join(profile.certifications[:3])}."
    return round(score, 1), rationale


def _score_education(profile: CandidateProfile) -> tuple[float, str]:
    """Score 0-100 based on education level."""
    count = len(profile.education)
    if count == 0:
        return 30.0, "No education records extracted."
    # Simple heuristic: more records = more education
    edu_text = " ".join(
        f"{e.degree} {e.field}".lower() for e in profile.education
    )
    if any(kw in edu_text for kw in ("phd", "ph.d", "doctorate", "doctor of")):
        score, label = 100.0, "PhD / Doctorate"
    elif any(kw in edu_text for kw in ("master", "msc", "mba", "m.tech", "m.e.")):
        score, label = 85.0, "Master's degree"
    elif any(kw in edu_text for kw in ("bachelor", "bsc", "b.tech", "b.e.", "b.s.", "undergraduate")):
        score, label = 70.0, "Bachelor's degree"
    elif any(kw in edu_text for kw in ("diploma", "associate", "higher secondary")):
        score, label = 50.0, "Diploma / Associate"
    else:
        score, label = 45.0, "Education listed"
    rationale = f"{label} detected across {count} record(s)."
    return round(score, 1), rationale


def _compute_scores(profile: CandidateProfile) -> list[ScoreComponent]:
    """Compute all score components for a candidate profile."""
    skill_score, skill_rationale = _score_skill_match(profile)
    exp_score, exp_rationale = _score_experience(profile)
    proj_score, proj_rationale = _score_projects(profile)
    cert_score, cert_rationale = _score_certifications(profile)
    edu_score, edu_rationale = _score_education(profile)

    return [
        ScoreComponent(
            criterion="Skill Match",
            weight=SCORING_WEIGHTS["skill_match"],
            raw_score=skill_score,
            weighted_score=round(skill_score * SCORING_WEIGHTS["skill_match"], 2),
            rationale=skill_rationale,
        ),
        ScoreComponent(
            criterion="Experience",
            weight=SCORING_WEIGHTS["experience"],
            raw_score=exp_score,
            weighted_score=round(exp_score * SCORING_WEIGHTS["experience"], 2),
            rationale=exp_rationale,
        ),
        ScoreComponent(
            criterion="Projects",
            weight=SCORING_WEIGHTS["projects"],
            raw_score=proj_score,
            weighted_score=round(proj_score * SCORING_WEIGHTS["projects"], 2),
            rationale=proj_rationale,
        ),
        ScoreComponent(
            criterion="Certifications",
            weight=SCORING_WEIGHTS["certifications"],
            raw_score=cert_score,
            weighted_score=round(cert_score * SCORING_WEIGHTS["certifications"], 2),
            rationale=cert_rationale,
        ),
        ScoreComponent(
            criterion="Education",
            weight=SCORING_WEIGHTS["education"],
            raw_score=edu_score,
            weighted_score=round(edu_score * SCORING_WEIGHTS["education"], 2),
            rationale=edu_rationale,
        ),
    ]


def rank_candidates_node(state: AgentState) -> AgentState:
    """
    Candidate Ranking Node
    ----------------------
    Applies the weighted scoring strategy to every screened profile.
    Produces a sorted RankedCandidate list (highest score first).

    Scoring weights:
      Skill Match   40%
      Experience    25%
      Projects      15%
      Certifications 10%
      Education     10%
    """
    ranked: list[RankedCandidate] = []

    for path, profile in state["profiles"].items():
        components = _compute_scores(profile)
        total = round(sum(c.weighted_score for c in components), 1)
        ranked.append(
            RankedCandidate(
                rank=0,  # assigned after sort
                name=profile.full_name or Path(path).stem,
                source_file=Path(path).name,
                total_score=total,
                components=components,
                profile=profile,
            )
        )

    # Sort descending by total score
    ranked.sort(key=lambda r: r.total_score, reverse=True)
    for i, candidate in enumerate(ranked, start=1):
        candidate.rank = i

    # Build a human-readable log
    log_lines = ["=== CANDIDATE RANKING ==="]
    for r in ranked:
        log_lines.append(
            f"  #{r.rank}  {r.name:<25}  Score: {r.total_score:>5.1f}/100"
        )

    return {
        **state,
        "ranked_candidates": ranked,
        "messages": [AIMessage(content="\n".join(log_lines))],
    }


# ──────────────────────────────────────────────────────────────────────────────
# Build the LangGraph StateGraph
# ──────────────────────────────────────────────────────────────────────────────

def build_graph() -> StateGraph:
    """
    Construct and compile the HireFlow resume pipeline graph.

    Graph topology:
      parse_resume → screen_candidate → rank_candidates → END
    """
    graph = StateGraph(AgentState)

    graph.add_node("parse_resume", parse_resume_node)
    graph.add_node("screen_candidate", screen_candidate_node)
    graph.add_node("rank_candidates", rank_candidates_node)

    graph.set_entry_point("parse_resume")
    graph.add_edge("parse_resume", "screen_candidate")
    graph.add_edge("screen_candidate", "rank_candidates")
    graph.add_edge("rank_candidates", END)

    return graph.compile()


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def run_pipeline(
    resume_paths: list[str],
    job_description: str,
    verbose: bool = False,
) -> list[RankedCandidate]:
    """
    Run the full resume screening + ranking pipeline.

    Parameters
    ----------
    resume_paths : list[str]
        Absolute or relative paths to resume files (.pdf, .docx, .txt, .md).
    job_description : str
        Plain-text job description used for candidate comparison.
    verbose : bool
        If True, print intermediate messages to stdout.

    Returns
    -------
    list[RankedCandidate]
        Candidates ranked from best to worst match. Each entry includes
        the full extracted profile, score breakdown, and overall score.
    """
    compiled = build_graph()

    initial_state: AgentState = {
        "job_description": job_description,
        "resume_paths": resume_paths,
        "raw_texts": {},
        "profiles": {},
        "ranked_candidates": [],
        "messages": [],
    }

    final_state = compiled.invoke(initial_state)

    if verbose:
        for msg in final_state.get("messages", []):
            content = msg.content if isinstance(msg.content, str) else str(msg.content)
            # Safe print — avoids cp1252 issues on Windows
            sys.stdout.buffer.write((content + "\n\n").encode("utf-8", errors="replace"))
            sys.stdout.buffer.flush()

    return final_state.get("ranked_candidates", [])


# ──────────────────────────────────────────────────────────────────────────────
# Pretty-print helpers
# ──────────────────────────────────────────────────────────────────────────────

def _bar(score: float, width: int = 20) -> str:
    filled = round(score / 100 * width)
    return "#" * filled + "." * (width - filled)


def _safe_print(text: str) -> None:
    """Write text to stdout safely on Windows cp1252 terminals."""
    sys.stdout.buffer.write((text + "\n").encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()

def print_results(ranked: list[RankedCandidate]) -> None:
    """Print a terminal report of the ranking results (ASCII-safe for Windows)."""
    SEP = "-" * 70
    _safe_print("\n" + "=" * 70)
    _safe_print("  HireFlow AI -- Resume Screening & Ranking Report")
    _safe_print("=" * 70 + "\n")

    if not ranked:
        _safe_print("  No candidates were successfully screened.")
        return

    for r in ranked:
        label = {1: "[1st]", 2: "[2nd]", 3: "[3rd]"}.get(r.rank, f"[#{r.rank}]")
        _safe_print(f"{label}  Rank {r.rank}:  {r.name}  ({r.source_file})")
        _safe_print(f"   Overall Score:  {r.total_score:.1f} / 100  [{_bar(r.total_score)}]")
        _safe_print(f"   JD Match:       {r.profile.match_percentage:.0f}%")
        _safe_print(f"   Experience:     {r.profile.years_experience:.1f} years")
        _safe_print("")

        _safe_print("   Score Breakdown:")
        for comp in r.components:
            pct_label = f"{comp.weight * 100:.0f}%"
            _safe_print(
                f"     {comp.criterion:<18} {pct_label:>4}  "
                f"{comp.raw_score:>5.1f}/100  [{_bar(comp.raw_score, 12)}]"
            )
            _safe_print(f"       -> {comp.rationale}")
        _safe_print("")

        if r.profile.matched_skills:
            _safe_print(f"   [+] Matched: {', '.join(r.profile.matched_skills[:8])}")
        if r.profile.missing_skills:
            _safe_print(f"   [-] Missing: {', '.join(r.profile.missing_skills[:5])}")
        if r.profile.candidate_summary:
            _safe_print("\n   Summary:")
            words = r.profile.candidate_summary.split()
            line, lines = [], []
            for word in words:
                if len(" ".join(line + [word])) > 65:
                    lines.append("      " + " ".join(line))
                    line = [word]
                else:
                    line.append(word)
            if line:
                lines.append("      " + " ".join(line))
            _safe_print("\n".join(lines))
        _safe_print(f"\n{SEP}\n")


# ──────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ──────────────────────────────────────────────────────────────────────────────

def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="resumeParseRank",
        description="HireFlow AI — Resume Screening & Candidate Ranking Agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Rank two resumes against a JD
  python agent/resumeParseRank.py \\
      --jd "Senior Python Engineer with FastAPI and Docker experience" \\
      --resumes alice.pdf bob.docx

  # Pass JD from a text file
  python agent/resumeParseRank.py \\
      --jd-file jd.txt \\
      --resumes *.pdf \\
      --json-output results.json
        """,
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--jd",
        metavar="TEXT",
        help="Job description as inline text",
    )
    group.add_argument(
        "--jd-file",
        metavar="FILE",
        help="Path to a text file containing the job description",
    )
    parser.add_argument(
        "--resumes",
        nargs="+",
        required=True,
        metavar="FILE",
        help="Resume files to screen (.pdf, .docx, .txt, .md)",
    )
    parser.add_argument(
        "--json-output",
        metavar="FILE",
        default=None,
        help="Save full results as JSON to this file",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print intermediate agent messages",
    )
    return parser


def main() -> None:
    parser = _build_arg_parser()
    args = parser.parse_args()

    # Load job description
    if args.jd:
        job_description = args.jd
    else:
        jd_path = Path(args.jd_file)
        if not jd_path.exists():
            print(f"Error: JD file not found: {args.jd_file}", file=sys.stderr)
            sys.exit(1)
        job_description = jd_path.read_text(encoding="utf-8").strip()

    # Validate resume files exist
    resume_paths = []
    for path in args.resumes:
        p = Path(path)
        if not p.exists():
            print(f"Warning: Resume file not found, skipping: {path}", file=sys.stderr)
        else:
            resume_paths.append(str(p.resolve()))

    if not resume_paths:
        print("Error: No valid resume files found.", file=sys.stderr)
        sys.exit(1)

    _safe_print(f"\nHireFlow AI -- Screening {len(resume_paths)} resume(s)...\n")

    # Run pipeline
    ranked = run_pipeline(
        resume_paths=resume_paths,
        job_description=job_description,
        verbose=args.verbose,
    )

    # Print results
    print_results(ranked)

    # Optional JSON export
    if args.json_output:
        output_path = Path(args.json_output)
        payload = [
            {
                "rank": r.rank,
                "name": r.name,
                "source_file": r.source_file,
                "total_score": r.total_score,
                "match_percentage": r.profile.match_percentage,
                "years_experience": r.profile.years_experience,
                "matched_skills": r.profile.matched_skills,
                "missing_skills": r.profile.missing_skills,
                "candidate_summary": r.profile.candidate_summary,
                "certifications": r.profile.certifications,
                "projects": [p.model_dump() for p in r.profile.projects],
                "education": [e.model_dump() for e in r.profile.education],
                "score_breakdown": [c.model_dump() for c in r.components],
            }
            for r in ranked
        ]
        output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        _safe_print(f"\nResults saved to: {output_path.resolve()}")

    _safe_print("\nDone.")


if __name__ == "__main__":
    main()
