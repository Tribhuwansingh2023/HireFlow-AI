"""
HireFlow AI — Mock Services (Interview Scheduler, Question Generator, Email Drafter).
Mirrors the frontend's `generateQuestions` and email logic from `agents.functions.ts`.
"""
import json
from typing import Dict, Any, List, Optional
from langchain_core.prompts import ChatPromptTemplate

from backend.ai.config import get_llm
from backend.ai.schemas import InterviewQuestion, InterviewQuestionsResult, EmailDraft


# ---------------------------------------------------------------------------
# Interview Scheduler (Mock — simulates Google Calendar + Meet)
# ---------------------------------------------------------------------------

def generate_interview_slots() -> List[str]:
    """Mock: returns available interview time slots."""
    return [
        "Monday, 10:00 AM (IST)",
        "Monday, 2:00 PM (IST)",
        "Tuesday, 11:30 AM (IST)",
        "Wednesday, 4:00 PM (IST)",
        "Thursday, 10:00 AM (IST)",
    ]


def generate_google_meet_link() -> str:
    """Mock: returns a Google Meet link."""
    return "https://meet.google.com/hfa-hire-flow"


# ---------------------------------------------------------------------------
# Interview Question Generator (mirrors frontend generateQuestions)
# ---------------------------------------------------------------------------

QUESTION_PROMPT = """You design rigorous, bias-free interview guides.
Return ONLY JSON: {{"questions": [{{
  "question": "...",
  "competency": "...",
  "why": "why this question for this candidate specifically",
  "signal": "what a strong answer shows"
}}]}}.

Produce exactly 7 questions, tailored to the round and calibrated
to the candidate's real experience and gaps.

ROUND {round_number}: {round_name}
JOB: {job_title} — required: {required_skills}
JD: {job_description}

CANDIDATE
Name: {candidate_name}
Headline: {candidate_headline}
Skills: {candidate_skills}
Experience: {candidate_years} years
Match score: {match_score}/100
Matched skills: {matched_skills}
Missing skills: {missing_skills}"""


def generate_interview_questions(
    job: Dict[str, Any],
    candidate: Dict[str, Any],
    round_number: int = 1,
    round_name: str = "Technical Screen",
) -> InterviewQuestionsResult:
    """
    Generate tailored interview questions for a candidate.
    """
    llm = get_llm(temperature=0.3)
    try:
        prompt = ChatPromptTemplate.from_template(QUESTION_PROMPT)
        chain = prompt | llm
        response = chain.invoke({
            "round_number": round_number,
            "round_name": round_name,
            "job_title": job.get("title", "Position"),
            "required_skills": ", ".join(job.get("required_skills", [])),
            "job_description": str(job.get("description", ""))[:3000],
            "candidate_name": candidate.get("full_name", "Candidate"),
            "candidate_headline": candidate.get("headline", ""),
            "candidate_skills": ", ".join(candidate.get("skills", [])),
            "candidate_years": candidate.get("years_experience", 0),
            "match_score": candidate.get("match_score", "N/A"),
            "matched_skills": ", ".join(candidate.get("matched_skills", [])),
            "missing_skills": ", ".join(candidate.get("missing_skills", [])),
        })

        content = str(response.content)
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()

        data = json.loads(content)
        questions = [
            InterviewQuestion(**q)
            for q in data.get("questions", [])
        ]
        return InterviewQuestionsResult(questions=questions)

    except Exception:
        # Fallback questions
        return InterviewQuestionsResult(questions=[
            InterviewQuestion(
                question="Walk us through a system you designed end-to-end. What trade-offs did you make?",
                competency="System Design",
                why="Tests real architecture experience",
                signal="Clear reasoning about scale, cost, and maintenance trade-offs",
            ),
            InterviewQuestion(
                question="Describe a time you had to debug a production issue under pressure.",
                competency="Problem Solving",
                why="Assesses ability to perform under stress",
                signal="Structured debugging approach with clear communication",
            ),
            InterviewQuestion(
                question="How do you approach learning a new technology or framework quickly?",
                competency="Adaptability",
                why="Evaluates growth mindset",
                signal="Concrete examples of rapid skill acquisition",
            ),
        ])


# ---------------------------------------------------------------------------
# Email Drafting Agent (mirrors frontend email logic)
# ---------------------------------------------------------------------------

EMAIL_PROMPT = """You draft warm, highly professional recruitment emails.

Email Type: {email_kind}
Candidate Name: {candidate_name}
Candidate Email: {candidate_email}
Job Title: {job_title}
Company: HireFlow AI
Context: {context}

Return ONLY JSON:
{{
  "subject": "email subject line",
  "body": "full email body with proper greeting and sign-off"
}}"""


def draft_email(
    kind: str,
    candidate_name: str,
    job_title: str,
    candidate_email: Optional[str] = None,
    context: Optional[str] = None,
) -> EmailDraft:
    """
    Draft a professional email for a candidate.
    kind: interview_invitation, offer_letter, rejection, follow_up
    """
    llm = get_llm(temperature=0.3)
    try:
        prompt = ChatPromptTemplate.from_template(EMAIL_PROMPT)
        chain = prompt | llm
        response = chain.invoke({
            "email_kind": kind,
            "candidate_name": candidate_name,
            "candidate_email": candidate_email or "candidate@example.com",
            "job_title": job_title,
            "context": context or "Standard process update.",
        })

        content = str(response.content)
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()

        data = json.loads(content)
        return EmailDraft(
            kind=kind,
            to_email=candidate_email,
            subject=data.get("subject", f"Update: {job_title} at HireFlow AI"),
            body=data.get("body", ""),
            variables={"candidate_name": candidate_name, "job_title": job_title},
        )

    except Exception:
        # Fallback templates
        templates = {
            "interview_invitation": {
                "subject": f"Interview Invitation — {job_title} at HireFlow AI",
                "body": f"Dear {candidate_name},\n\nWe were impressed by your profile and would like to invite you for an interview for the {job_title} position at HireFlow AI.\n\nPlease let us know your availability for next week.\n\nBest regards,\nHireFlow Talent Team",
            },
            "offer_letter": {
                "subject": f"Job Offer: {job_title} at HireFlow AI",
                "body": f"Dear {candidate_name},\n\nWe are thrilled to extend an offer for the {job_title} position at HireFlow AI! Details will follow in a formal letter.\n\nBest regards,\nHireFlow HR Team",
            },
            "rejection": {
                "subject": f"Update on your {job_title} application",
                "body": f"Dear {candidate_name},\n\nThank you for your interest in the {job_title} role. After careful consideration, we have decided to move forward with another candidate.\n\nWe wish you the very best.\n\nBest regards,\nHireFlow HR Team",
            },
        }
        tpl = templates.get(kind, templates["rejection"])
        return EmailDraft(
            kind=kind,
            to_email=candidate_email,
            subject=tpl["subject"],
            body=tpl["body"],
            variables={"candidate_name": candidate_name, "job_title": job_title},
        )
