"""
HireFlow AI — Resume Screening Agent HTTP Server
=================================================
Exposes the LangGraph resume pipeline as a REST API.

Start server:
    python agent/server.py

Or with uvicorn directly:
    uvicorn agent.server:app --reload --port 8001

Endpoints:
    GET  /           → Welcome message
    GET  /health     → Health check (also verifies GROQ_API_KEY)
    POST /screen     → Upload resume(s) + job description → ranked results
    GET  /docs       → Interactive Swagger UI (auto-generated)
    GET  /redoc      → ReDoc documentation
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse

# Load .env from project root (one level up from agent/)
load_dotenv(Path(__file__).parent.parent / ".env")

from agent.resumeParseRank import (
    CandidateProfile,
    RankedCandidate,
    ScoreComponent,
    run_pipeline,
)

# ──────────────────────────────────────────────────────────────────────────────
# App setup
# ──────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="HireFlow AI — Resume Screening Agent",
    description=(
        "LangGraph-powered resume screening and candidate ranking API.\n\n"
        "Upload one or more resume files (PDF/DOCX/TXT) and a job description "
        "to get AI-extracted candidate profiles ranked by a weighted scoring engine.\n\n"
        "**Scoring weights:** Skill Match 40% | Experience 25% | "
        "Projects 15% | Certifications 10% | Education 10%"
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Allow the React frontend (running on :3000 / :5173 / :8080) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────────────────────
# Response models
# ──────────────────────────────────────────────────────────────────────────────

class ScoreComponentOut(ScoreComponent):
    pass


class RankedCandidateOut(RankedCandidate):
    pass


# ──────────────────────────────────────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def root():
    """Welcome page with quick links."""
    return """
    <!DOCTYPE html>
    <html>
    <head>
      <title>HireFlow AI Agent</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 700px; margin: 60px auto;
               background: #0f172a; color: #e2e8f0; padding: 0 20px; }
        h1   { color: #818cf8; }
        a    { color: #60a5fa; }
        .badge { background: #1e293b; border-radius: 8px; padding: 16px 20px; margin: 12px 0; }
        code { background: #1e293b; padding: 2px 6px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <h1>&#x1F916; HireFlow AI — Resume Screening Agent</h1>
      <p>LangGraph-powered resume screening &amp; candidate ranking API.</p>

      <div class="badge">
        <strong>&#x1F4C4; POST /screen</strong><br>
        Upload resumes + job description → get AI-ranked candidates.<br>
        Try it at <a href="/docs">/docs</a> (Swagger UI)
      </div>

      <div class="badge">
        <strong>&#x1F49A; GET /health</strong><br>
        Check server status and API key configuration.
      </div>

      <div class="badge">
        <strong>&#x1F4CB; Interactive Docs</strong><br>
        <a href="/docs">Swagger UI</a> &nbsp;|&nbsp; <a href="/redoc">ReDoc</a>
      </div>

      <hr style="border-color:#1e293b">
      <p>
        Model: <code>llama-3.3-70b-versatile</code> via Groq &nbsp;|&nbsp;
        Override: set <code>GROQ_MODEL</code> env var
      </p>
    </body>
    </html>
    """


@app.get("/health", summary="Health check")
def health():
    """
    Returns server status and verifies that GROQ_API_KEY is configured.
    """
    api_key = os.getenv("GROQ_API_KEY", "")
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    configured = bool(api_key)
    return {
        "status": "ok" if configured else "degraded",
        "groq_api_key_set": configured,
        "model": model,
        "message": (
            "Agent is ready." if configured
            else "GROQ_API_KEY is not set — add it to your .env file."
        ),
    }


@app.post(
    "/screen",
    summary="Screen and rank resumes",
    response_model=list[dict],
    responses={
        200: {"description": "Ranked list of candidates"},
        400: {"description": "Bad request — no resumes or empty JD"},
        500: {"description": "Agent error"},
    },
)
async def screen_resumes(
    job_description: str = Form(
        ...,
        description="Plain-text job description used to score candidates",
        example=(
            "Senior Python Engineer\n\n"
            "Requirements:\n"
            "- 3+ years Python experience\n"
            "- FastAPI, PostgreSQL, Docker\n"
            "- Cloud (AWS/GCP/Azure)"
        ),
    ),
    resumes: list[UploadFile] = File(
        ...,
        description="One or more resume files (.pdf, .docx, .txt, .md)",
    ),
):
    """
    ## Screen & Rank Resumes

    Upload one or more resume files alongside a job description.
    The agent will:

    1. **Parse** each resume (PDF text extraction / DOCX / TXT)
    2. **Screen** each candidate with Groq LLM — extracting skills, experience,
       education, projects, certifications, and comparing against the JD
    3. **Rank** all candidates using a weighted scoring engine:
       - Skill Match → **40%**
       - Experience → **25%**
       - Projects → **15%**
       - Certifications → **10%**
       - Education → **10%**

    Returns a ranked JSON array, best candidate first.
    """
    if not job_description.strip():
        raise HTTPException(status_code=400, detail="job_description cannot be empty.")
    if not resumes:
        raise HTTPException(status_code=400, detail="At least one resume file is required.")

    # Save uploaded files to a temp directory
    tmp_dir = tempfile.mkdtemp(prefix="hireflow_")
    saved_paths: list[str] = []

    for upload in resumes:
        # Validate extension
        name = upload.filename or "resume.pdf"
        ext = Path(name).suffix.lower()
        if ext not in (".pdf", ".docx", ".txt", ".md"):
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type '{ext}' for '{name}'. Use .pdf, .docx, .txt, or .md",
            )
        dest = Path(tmp_dir) / name
        dest.write_bytes(await upload.read())
        saved_paths.append(str(dest))

    # Run the LangGraph pipeline
    try:
        ranked = run_pipeline(
            resume_paths=saved_paths,
            job_description=job_description,
            verbose=False,
        )
    except EnvironmentError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Agent error: {exc}")
    finally:
        # Clean up temp files
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)

    # Serialize to JSON-friendly dicts
    result = []
    for r in ranked:
        result.append({
            "rank": r.rank,
            "name": r.name,
            "source_file": r.source_file,
            "total_score": r.total_score,
            "jd_match_percentage": r.profile.match_percentage,
            "years_experience": r.profile.years_experience,
            "email": r.profile.email,
            "phone": r.profile.phone,
            "location": r.profile.location,
            "headline": r.profile.headline,
            "skills": r.profile.skills,
            "matched_skills": r.profile.matched_skills,
            "missing_skills": r.profile.missing_skills,
            "certifications": r.profile.certifications,
            "candidate_summary": r.profile.candidate_summary,
            "education": [e.model_dump() for e in r.profile.education],
            "projects": [p.model_dump() for p in r.profile.projects],
            "work_history": [w.model_dump() for w in r.profile.work_history],
            "score_breakdown": [
                {
                    "criterion": c.criterion,
                    "weight_pct": f"{c.weight * 100:.0f}%",
                    "raw_score": c.raw_score,
                    "weighted_score": c.weighted_score,
                    "rationale": c.rationale,
                }
                for c in r.components
            ],
        })

    return JSONResponse(content=result)


# ──────────────────────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("AGENT_PORT", "8001"))
    print(f"\nHireFlow AI Agent Server starting on http://localhost:{port}")
    print(f"  Swagger UI  ->  http://localhost:{port}/docs")
    print(f"  Health      ->  http://localhost:{port}/health\n")

    uvicorn.run(
        "agent.server:app",
        host="0.0.0.0",
        port=port,
        reload=True,
    )
