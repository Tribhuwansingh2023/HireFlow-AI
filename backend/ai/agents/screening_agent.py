"""
HireFlow AI — Resume Screening Agent.
Mirrors the frontend's `screenApplication` from `agents.functions.ts`.

Pipeline:
  1. Parse resume text → structured `ParsedProfile` via Gemini.
  2. Run deterministic `score_candidate()` for transparent component scores.
  3. LLM analysis for summary, recommendation, strengths, risks, bias audit.
  4. Return `ScreeningResult` matching the frontend `applications` table shape.
"""
import json
from typing import Optional, Dict, Any, Union, BinaryIO
from langchain_core.prompts import ChatPromptTemplate

from backend.ai.config import get_llm
from backend.ai.parser import extract_text_from_pdf
from backend.ai.schemas import (
    ParsedProfile,
    ScreeningResult,
    ScreeningAnalysis,
)
from backend.ai.scoring import score_candidate, composite_score


# ---------------------------------------------------------------------------
# Step 1: Resume → Structured Profile (mirrors frontend parseResume)
# ---------------------------------------------------------------------------

PARSE_PROMPT = """You are a precise resume parser. Return ONLY JSON with keys:
full_name, email, phone, location, headline, years_experience (number),
skills (array of short canonical skill names, lowercase),
education (array of {{degree, institution, year}}),
work_history (array of {{title, company, period, highlights}}),
links ({{linkedin, github, portfolio}}).
Use empty strings for anything missing. Never invent facts.

Resume file: {file_name}

---
{resume_text}"""


def parse_resume(
    resume_text: str,
    file_name: str = "resume.pdf",
) -> ParsedProfile:
    """
    Parse resume text into a structured ParsedProfile using Gemini.
    Mirrors the frontend Zod `ParsedProfile` schema.
    """
    text = resume_text[:24000]
    if len(text.strip()) < 40:
        raise ValueError(
            "We couldn't read enough text from this file. "
            "Try a text-based PDF, a DOCX, or enable OCR."
        )

    llm = get_llm(temperature=0.1)
    prompt = ChatPromptTemplate.from_template(PARSE_PROMPT)

    try:
        structured_llm = llm.with_structured_output(ParsedProfile)
        chain = prompt | structured_llm
        profile: ParsedProfile = chain.invoke({
            "file_name": file_name,
            "resume_text": text,
        })
        # Normalise skills to lowercase
        profile.skills = [s.lower().strip() for s in profile.skills if s.strip()]
        return profile
    except Exception:
        # Fallback: raw LLM call + manual JSON parse
        chain = prompt | llm
        response = chain.invoke({
            "file_name": file_name,
            "resume_text": text,
        })
        content = str(response.content)
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        data = json.loads(content)
        profile = ParsedProfile.model_validate(data)
        profile.skills = [s.lower().strip() for s in profile.skills if s.strip()]
        return profile


# ---------------------------------------------------------------------------
# Step 2: Screening (deterministic scoring + LLM analysis)
# ---------------------------------------------------------------------------

ANALYSIS_PROMPT = """You are a fair-hiring screening analyst. Judge ONLY job-relevant evidence.
Explicitly ignore and never mention name, gender, age, nationality, ethnicity, marital status,
photo or university prestige as a reason.

Return ONLY JSON:
{{
  "summary": "3-4 sentences, evidence based",
  "recommendation": "advance" or "hold" or "reject",
  "confidence": 0.0-1.0,
  "strengths": ["3 short bullets"],
  "risks": ["2-3 short bullets"],
  "bias_notes": {{
    "flagged": ["array of bias-prone signals deliberately excluded"],
    "statement": "1 sentence on how fairness was preserved"
  }}
}}

JOB
Title: {job_title} ({job_seniority})
Required skills: {required_skills}
Nice to have: {nice_skills}
Minimum experience: {min_years} years
Description: {job_description}

CANDIDATE
Headline: {candidate_headline}
Experience: {candidate_years} years
Skills: {candidate_skills}
Resume: {resume_text}

Deterministic component scores: {score_components}
Composite score: {composite}/100"""


def screen_resume(
    resume_source: Union[str, BinaryIO, bytes],
    job: Dict[str, Any],
    raw_resume_text: Optional[str] = None,
    file_name: str = "resume.pdf",
) -> Dict[str, Any]:
    """
    Full screening pipeline:
      1. Extract text from PDF (if needed)
      2. Parse into structured profile
      3. Deterministic scoring against job
      4. LLM analysis for summary/recommendation
      5. Return shape matching frontend `applications` table update

    Returns dict with keys: parsed_profile, match_score, score_breakdown,
    matched_skills, missing_skills, ai_summary, ai_recommendation,
    ai_confidence, bias_notes.
    """
    # --- Extract text ---
    if raw_resume_text:
        text_content = raw_resume_text
    elif isinstance(resume_source, str) and len(resume_source) > 300:
        text_content = resume_source
    else:
        text_content = extract_text_from_pdf(resume_source)

    # --- Parse resume into structured profile ---
    profile = parse_resume(text_content, file_name)

    # --- Build candidate dict for deterministic scorer ---
    candidate_dict = {
        "skills": profile.skills,
        "years_experience": profile.years_experience,
        "resume_text": text_content,
        "education": [e.model_dump() for e in profile.education],
        "location": profile.location,
    }

    # --- Deterministic scoring (mirrors frontend scoring.ts) ---
    breakdown = score_candidate(job, candidate_dict)
    final_score = composite_score(breakdown.components)

    # --- LLM analysis for qualitative assessment ---
    llm = get_llm(temperature=0.1)

    try:
        prompt = ChatPromptTemplate.from_template(ANALYSIS_PROMPT)
        chain = prompt | llm
        response = chain.invoke({
            "job_title": job.get("title", "Position"),
            "job_seniority": job.get("seniority", "n/a"),
            "required_skills": ", ".join(job.get("required_skills", [])),
            "nice_skills": ", ".join(job.get("nice_to_have_skills", [])),
            "min_years": job.get("min_experience_years", 0),
            "job_description": str(job.get("description", ""))[:4000],
            "candidate_headline": profile.headline,
            "candidate_years": profile.years_experience,
            "candidate_skills": ", ".join(profile.skills),
            "resume_text": text_content[:9000],
            "score_components": json.dumps([c.model_dump() for c in breakdown.components]),
            "composite": final_score,
        })

        content = str(response.content)
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        analysis = json.loads(content)
    except Exception as e:
        analysis = {
            "summary": f"Automated screening completed. Composite score: {final_score}/100.",
            "recommendation": "advance" if final_score >= 70 else ("hold" if final_score >= 45 else "reject"),
            "confidence": 0.5,
            "strengths": [f"Matched {len(breakdown.matched)} required skills"],
            "risks": [f"Missing {len(breakdown.missing)} required skills"],
            "bias_notes": {
                "flagged": [],
                "statement": "Screening used only job-relevant evidence; demographic signals were excluded.",
            },
        }

    bias_notes = {
        "flagged": analysis.get("bias_notes", {}).get("flagged", []),
        "statement": analysis.get("bias_notes", {}).get(
            "statement",
            "Screening used only job-relevant evidence; demographic signals were excluded.",
        ),
        "excluded_attributes": [
            "name", "gender", "age", "nationality",
            "ethnicity", "photo", "school prestige",
        ],
    }

    return {
        "parsed_profile": profile.model_dump(),
        "match_score": final_score,
        "score_breakdown": {
            "components": [c.model_dump() for c in breakdown.components],
            "strengths": analysis.get("strengths", []),
            "risks": analysis.get("risks", []),
            "method": "hybrid: deterministic rules (85%) + LLM analysis, no embedding",
        },
        "matched_skills": breakdown.matched,
        "missing_skills": breakdown.missing,
        "ai_summary": analysis.get("summary", ""),
        "ai_recommendation": analysis.get("recommendation", "hold"),
        "ai_confidence": max(0, min(1, float(analysis.get("confidence", 0.5)))),
        "bias_notes": bias_notes,
    }
