"""
HireFlow AI — Verification Test Suite.
Tests all agents, scoring, and workflow without needing a database.
Run: python -m backend.ai.test_screening   (from workspace root)
"""
import sys
import os
import json

# Ensure workspace root is on path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from dotenv import load_dotenv
load_dotenv("backend/.env")

from backend.ai.schemas import HireFlowState
from backend.ai.scoring import score_candidate, composite_score, dedupe_key
from backend.ai.agents.screening_agent import parse_resume, screen_resume
from backend.ai.agents.ranking_agent import rank_candidates
from backend.ai.agents.mock_services import (
    generate_interview_slots,
    generate_google_meet_link,
    generate_interview_questions,
    draft_email,
)
from backend.ai.workflow import run_hireflow_workflow


# ---------------------------------------------------------------------------
# Test Data (matching frontend `jobs` and `candidates` table shapes)
# ---------------------------------------------------------------------------

SAMPLE_JOB = {
    "title": "Senior Full-Stack Engineer",
    "description": """We are looking for a Senior Full-Stack Engineer to build and maintain
our recruitment automation platform. You will work across Python backend (FastAPI),
React/TypeScript frontend, and AI/ML pipelines using LangChain and Gemini API.
Strong experience with PostgreSQL, Docker, and cloud deployments required.""",
    "required_skills": [
        "Python", "FastAPI", "React", "TypeScript",
        "PostgreSQL", "Docker", "REST APIs"
    ],
    "nice_to_have_skills": [
        "LangChain", "Gemini API", "LangGraph", "Kubernetes", "Redis"
    ],
    "min_experience_years": 4,
    "seniority": "Senior",
    "location": "Remote",
    "employment_type": "full_time",
    "department": "Engineering",
    "interview_rounds": 3,
}

SAMPLE_RESUME_1 = """
Alex Mercer
Email: alex.mercer@example.com | Phone: (555) 019-2831
Location: New York, NY | GitHub: github.com/alexmercer

PROFESSIONAL SUMMARY:
Senior Software Engineer with 5 years of experience building high-performance
web applications and AI-driven platforms. Specialized in Python (FastAPI, Flask)
and React/TypeScript frontends.

TECHNICAL SKILLS:
Python, FastAPI, Flask, React, TypeScript, PostgreSQL, SQLite, Redis,
Docker, Git, REST APIs, LangChain, LangGraph, Gemini API, AWS

WORK EXPERIENCE:
Lead AI Solutions Engineer | TechEdge Solutions (2022 - Present)
- Architected agentic workflow systems using LangGraph and FastAPI
- Integrated Gemini LLMs for document extraction
- Led team of 4 building React dashboards

Backend Engineer | DataPulse Inc. (2020 - 2022)
- Designed microservices in FastAPI handling 1M daily requests
- Optimized PostgreSQL queries, reducing latency by 35%

EDUCATION:
B.S. Computer Science | University of Michigan (2016 - 2020)

CERTIFICATIONS:
- AWS Certified Developer - Associate (2023)
"""

SAMPLE_RESUME_2 = """
Jordan Lee
Email: jordan.lee@example.com | Phone: (555) 443-8892
Location: Austin, TX

SUMMARY:
Junior Python developer with 2 years of experience in backend development.

SKILLS:
Python, Django, SQL, HTML, CSS, Git

EXPERIENCE:
Junior Developer | SmallCo (2022 - 2024)
- Built internal REST APIs using Django
- Wrote SQL queries for reporting dashboards

EDUCATION:
B.S. Information Technology | State University (2022)
"""


def test_01_deterministic_scoring():
    """Test the deterministic scoring engine (no LLM calls)."""
    print("\n--- Test 1: Deterministic Scoring Engine ---")

    candidate = {
        "skills": ["python", "fastapi", "react", "typescript", "postgresql", "docker", "rest apis",
                    "langchain", "gemini api"],
        "years_experience": 5,
        "resume_text": SAMPLE_RESUME_1,
        "education": [{"degree": "B.S. Computer Science", "institution": "University of Michigan", "year": "2020"}],
        "location": "New York, NY",
    }

    breakdown = score_candidate(SAMPLE_JOB, candidate)
    total = composite_score(breakdown.components)

    print(f"  Composite Score: {total}/100")
    for c in breakdown.components:
        print(f"    {c.label}: {c.score}/100 (weight {c.weight})")
    print(f"  Matched: {breakdown.matched}")
    print(f"  Missing: {breakdown.missing}")
    assert total > 60, f"Expected score > 60 for strong candidate, got {total}"
    print("  ✅ PASSED")
    return total


def test_02_dedupe_key():
    """Test deduplication key generation."""
    print("\n--- Test 2: Dedupe Key ---")
    dk1 = dedupe_key("Alex Mercer", "alex.mercer@example.com", "(555) 019-2831")
    dk2 = dedupe_key("Alex Mercer", "", "(555) 019-2831")
    dk3 = dedupe_key("Alex Mercer", "", "")
    print(f"  With email: {dk1}")
    print(f"  With phone: {dk2}")
    print(f"  Name only:  {dk3}")
    assert dk1.startswith("e:")
    assert dk2.startswith("p:")
    assert dk3.startswith("n:")
    print("  ✅ PASSED")


def test_03_resume_parsing():
    """Test LLM-powered resume parsing (requires GROQ_API_KEY)."""
    print("\n--- Test 3: Resume Parsing Agent (LLM) ---")
    api_key = os.getenv("GROQ_API_KEY") or os.getenv("GROQ_API_KEY")
    if not api_key:
        print("  ⚠️  SKIPPED (no GROQ_API_KEY set)")
        return None

    profile = parse_resume(SAMPLE_RESUME_1, "alex_mercer_resume.pdf")
    print(f"  Name: {profile.full_name}")
    print(f"  Email: {profile.email}")
    print(f"  Skills: {profile.skills[:8]}...")
    print(f"  Experience: {profile.years_experience} years")
    print(f"  Education: {len(profile.education)} entries")
    print(f"  Work History: {len(profile.work_history)} entries")
    assert profile.full_name.lower() != "unnamed candidate"
    print("  ✅ PASSED")
    return profile


def test_04_screening():
    """Test full screening pipeline (requires GROQ_API_KEY)."""
    print("\n--- Test 4: Full Screening Pipeline (LLM) ---")
    api_key = os.getenv("GROQ_API_KEY") or os.getenv("GROQ_API_KEY")
    if not api_key:
        print("  ⚠️  SKIPPED (no GROQ_API_KEY set)")
        return None

    result = screen_resume(
        resume_source=SAMPLE_RESUME_1,
        job=SAMPLE_JOB,
        raw_resume_text=SAMPLE_RESUME_1,
    )
    print(f"  Match Score: {result['match_score']}/100")
    print(f"  Recommendation: {result['ai_recommendation']}")
    print(f"  Confidence: {result['ai_confidence']}")
    print(f"  Matched Skills: {result['matched_skills']}")
    print(f"  Missing Skills: {result['missing_skills']}")
    print(f"  Summary: {result['ai_summary'][:120]}...")
    print("  ✅ PASSED")
    return result


def test_05_ranking():
    """Test multi-candidate ranking (requires GROQ_API_KEY)."""
    print("\n--- Test 5: Candidate Ranking Agent (LLM) ---")
    api_key = os.getenv("GROQ_API_KEY") or os.getenv("GROQ_API_KEY")
    if not api_key:
        print("  ⚠️  SKIPPED (no GROQ_API_KEY set)")
        return

    candidates = [
        {
            "parsed_profile": {
                "full_name": "Alex Mercer",
                "skills": ["python", "fastapi", "react", "typescript", "postgresql", "docker", "rest apis"],
                "years_experience": 5,
                "education": [{"degree": "B.S. CS", "institution": "Univ of Michigan", "year": "2020"}],
                "location": "New York, NY",
            },
            "resume_text": SAMPLE_RESUME_1,
        },
        {
            "parsed_profile": {
                "full_name": "Jordan Lee",
                "skills": ["python", "django", "sql", "html", "css", "git"],
                "years_experience": 2,
                "education": [{"degree": "B.S. IT", "institution": "State University", "year": "2022"}],
                "location": "Austin, TX",
            },
            "resume_text": SAMPLE_RESUME_2,
        },
    ]

    result = rank_candidates(candidates, SAMPLE_JOB)
    print(f"  Job: {result.job_title}")
    for r in result.rankings:
        print(f"  Rank #{r.rank}: {r.candidate_name} — Score: {r.total_score}/100")
        print(f"    Reason: {r.reason}")
    assert result.rankings[0].total_score >= result.rankings[1].total_score
    print("  ✅ PASSED")


def test_06_mock_services():
    """Test mock scheduler and email drafting (no LLM needed for fallback)."""
    print("\n--- Test 6: Mock Services ---")
    slots = generate_interview_slots()
    meet_link = generate_google_meet_link()
    print(f"  Slots: {slots[:2]}...")
    print(f"  Meet link: {meet_link}")
    assert len(slots) >= 3
    assert "meet.google.com" in meet_link
    print("  ✅ PASSED")


def test_07_full_workflow():
    """Test full LangGraph workflow (requires GROQ_API_KEY)."""
    print("\n--- Test 7: Full LangGraph Workflow ---")
    api_key = os.getenv("GROQ_API_KEY") or os.getenv("GROQ_API_KEY")
    if not api_key:
        print("  ⚠️  SKIPPED (no GROQ_API_KEY set)")
        return

    initial_state: HireFlowState = {
        "job": SAMPLE_JOB,
        "resume_text": SAMPLE_RESUME_1,
        "resume_file_name": "alex_mercer_resume.pdf",
        "hr_approved": True,
        "status": "initialized",
    }

    final = run_hireflow_workflow(initial_state)
    print(f"  Final Status: {final.get('status')}")
    print(f"  Screening Score: {final.get('screening_result', {}).get('match_score')}")
    print(f"  Ranking Summary: {final.get('ranking_result', {}).get('summary', '')[:80]}...")
    print(f"  Interview Slots: {len(final.get('interview_slots', []))} slots")
    print(f"  Questions: {len(final.get('interview_questions', {}).get('questions', []))} questions")
    print(f"  Email Drafts: {len(final.get('email_drafts', []))} emails")
    print("  ✅ PASSED")


if __name__ == "__main__":
    print("=" * 64)
    print("  HireFlow AI — Backend Verification Test Suite")
    print("=" * 64)

    test_01_deterministic_scoring()
    test_02_dedupe_key()
    test_03_resume_parsing()
    test_04_screening()
    test_05_ranking()
    test_06_mock_services()
    test_07_full_workflow()

    print("\n" + "=" * 64)
    print("  ✅ All tests executed!")
    print("=" * 64)
