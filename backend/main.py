"""
HireFlow AI — FastAPI Backend Server.

Provides REST API endpoints for:
  - Resume upload & parsing
  - Candidate screening against job descriptions
  - Multi-candidate ranking
  - Interview question generation
  - Email drafting
  - Full LangGraph workflow execution
  - Health check

All endpoints return JSON aligned with the Lovable frontend Supabase types.
"""
import os
import sys
import json
import tempfile
from typing import List, Optional, Dict, Any

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.ai.parser import extract_text_from_pdf
from backend.ai.agents.screening_agent import parse_resume, screen_resume
from backend.ai.agents.ranking_agent import rank_candidates
from backend.ai.agents.mock_services import (
    generate_interview_slots,
    generate_google_meet_link,
    generate_interview_questions,
    draft_email,
)
from backend.ai.scoring import score_candidate, composite_score, dedupe_key
from backend.ai.workflow import run_hireflow_workflow
from backend.ai.schemas import JobDescription, HireFlowState


# ---------------------------------------------------------------------------
# App & CORS
# ---------------------------------------------------------------------------

app = FastAPI(
    title="HireFlow AI — Backend API",
    description="Agentic Recruitment & Hiring Automation Platform",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://hireflow-agent-ai.lovable.app",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------------------------

class ScreenRequest(BaseModel):
    resume_text: str
    file_name: str = "resume.pdf"
    job: JobDescription

class ParseResumeRequest(BaseModel):
    resume_text: str
    file_name: str = "resume.pdf"


class RankRequest(BaseModel):
    candidates: List[Dict[str, Any]]
    job: JobDescription


class QuestionsRequest(BaseModel):
    job: JobDescription
    candidate: Dict[str, Any]
    round_number: int = 1
    round_name: str = "Technical Screen"


class EmailRequest(BaseModel):
    kind: str  # interview_invitation, offer_letter, rejection, follow_up
    candidate_name: str
    job_title: str
    candidate_email: Optional[str] = None
    context: Optional[str] = None


class WorkflowRequest(BaseModel):
    resume_text: str
    resume_file_name: str = "resume.pdf"
    job: JobDescription
    hr_approved: bool = True


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    """Health check endpoint."""
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    return {
        "status": "healthy",
        "service": "HireFlow AI Backend",
        "version": "1.0.0",
        "gemini_configured": bool(api_key),
    }


@app.post("/api/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    """
    Upload a PDF resume and extract text + parse into structured profile.
    Returns: { text, parsed_profile, dedupe_key }
    """
    if not file.filename:
        raise HTTPException(400, "No file provided")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported. Upload a .pdf file.")

    contents = await file.read()
    text = extract_text_from_pdf(contents)

    if text.startswith("Error") or len(text.strip()) < 40:
        raise HTTPException(422, f"Could not extract text from PDF: {text[:200]}")

    try:
        profile = parse_resume(text, file.filename)
        dk = dedupe_key(profile.full_name, profile.email, profile.phone)
        return {
            "text": text,
            "parsed_profile": profile.model_dump(),
            "dedupe_key": dk,
        }
    except Exception as e:
        raise HTTPException(500, f"Resume parsing failed: {str(e)}")


@app.post("/api/parse-resume-text")
async def parse_resume_text(request: ParseResumeRequest):
    """
    Parse extracted resume text into a structured profile directly.
    Returns: { parsed_profile, dedupe_key }
    """
    if len(request.resume_text.strip()) < 40:
        raise HTTPException(422, "Resume text is too short or empty.")
    
    try:
        profile = parse_resume(request.resume_text, request.file_name)
        dk = dedupe_key(profile.full_name, profile.email, profile.phone)
        return {
            "parsed_profile": profile.model_dump(),
            "dedupe_key": dk,
        }
    except Exception as e:
        raise HTTPException(500, f"Resume text parsing failed: {str(e)}")


@app.post("/api/screen")
async def screen_candidate(request: ScreenRequest):
    """
    Screen a candidate's resume against a job description.
    Returns: screening result matching frontend applications table shape.
    """
    try:
        result = screen_resume(
            resume_source=request.resume_text,
            job=request.job.model_dump(),
            raw_resume_text=request.resume_text,
            file_name=request.file_name,
        )
        return result
    except Exception as e:
        raise HTTPException(500, f"Screening failed: {str(e)}")


@app.post("/api/rank")
async def rank_candidates_endpoint(request: RankRequest):
    """
    Rank multiple candidates against a job description.
    Returns: ranked list with scores and AI explanations.
    """
    try:
        result = rank_candidates(
            candidates_data=request.candidates,
            job=request.job.model_dump(),
        )
        return result.model_dump()
    except Exception as e:
        raise HTTPException(500, f"Ranking failed: {str(e)}")


@app.post("/api/questions")
async def generate_questions_endpoint(request: QuestionsRequest):
    """
    Generate tailored interview questions for a candidate.
    Returns: list of 7 questions with competency, why, and signal.
    """
    try:
        result = generate_interview_questions(
            job=request.job.model_dump(),
            candidate=request.candidate,
            round_number=request.round_number,
            round_name=request.round_name,
        )
        return result.model_dump()
    except Exception as e:
        raise HTTPException(500, f"Question generation failed: {str(e)}")


@app.post("/api/email")
async def draft_email_endpoint(request: EmailRequest):
    """
    Draft a professional email for a candidate.
    Returns: email with subject, body, and metadata.
    """
    try:
        result = draft_email(
            kind=request.kind,
            candidate_name=request.candidate_name,
            job_title=request.job_title,
            candidate_email=request.candidate_email,
            context=request.context,
        )
        return result.model_dump()
    except Exception as e:
        raise HTTPException(500, f"Email drafting failed: {str(e)}")


@app.post("/api/workflow")
async def run_workflow(request: WorkflowRequest):
    """
    Execute the full LangGraph multi-agent pipeline:
    Parse → Screen → Rank → [HR Approval] → Schedule → Questions → Emails.
    Returns: complete final state of the workflow.
    """
    try:
        initial_state: HireFlowState = {
            "job": request.job.model_dump(),
            "resume_text": request.resume_text,
            "resume_file_name": request.resume_file_name,
            "hr_approved": request.hr_approved,
            "status": "initialized",
        }
        final_state = run_hireflow_workflow(initial_state)
        return final_state
    except Exception as e:
        raise HTTPException(500, f"Workflow execution failed: {str(e)}")


@app.get("/api/mock/interview-slots")
async def get_interview_slots():
    """Mock: Get available interview time slots."""
    return {
        "slots": generate_interview_slots(),
        "meet_link": generate_google_meet_link(),
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
