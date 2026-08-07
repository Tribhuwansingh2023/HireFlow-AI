"""
HireFlow AI — Deterministic scoring engine.
Port of the frontend's `scoring.ts` to Python so scores are reproducible
on both client and server.
"""
import re
from typing import List, Dict, Any, Optional
from backend.ai.schemas import ScoreComponent, ScoreBreakdown


def _normalise(s: str) -> str:
    """Lowercase, strip special chars, collapse whitespace."""
    s = s.lower()
    s = re.sub(r"[^a-z0-9+#.\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _skill_hit(skill: str, candidate_skills: List[str], resume: str) -> bool:
    """Check if a skill appears in candidate skills list OR resume text."""
    n = _normalise(skill)
    if not n:
        return False
    for cs in candidate_skills:
        normalised_cs = _normalise(cs)
        if normalised_cs == n or n in normalised_cs:
            return True
    return n in resume


def score_candidate(
    job: Dict[str, Any],
    candidate: Dict[str, Any],
) -> ScoreBreakdown:
    """
    Deterministic scoring matching the frontend's `scoreCandidate()`.
    Weights: required_skills 40%, experience 25%, nice_to_have 10%,
    education 5%, location 5%.
    """
    resume = _normalise(str(candidate.get("resume_text") or ""))
    cand_skills = [str(s) for s in (candidate.get("skills") or [])]
    required = [str(s) for s in (job.get("required_skills") or []) if s]
    nice = [str(s) for s in (job.get("nice_to_have_skills") or []) if s]

    matched: List[str] = []
    missing: List[str] = []
    for s in required:
        if _skill_hit(s, cand_skills, resume):
            matched.append(s)
        else:
            missing.append(s)

    nice_matched = [s for s in nice if _skill_hit(s, cand_skills, resume)]

    # --- Required skills score (weight 0.40) ---
    req_score = round(len(matched) / len(required) * 100) if required else 70

    # --- Nice-to-have score (weight 0.10) ---
    nice_score = round(len(nice_matched) / len(nice) * 100) if nice else 60

    # --- Experience score (weight 0.25) ---
    min_years = int(job.get("min_experience_years") or 0)
    years = int(candidate.get("years_experience") or 0)
    if min_years <= 0:
        exp_score = 75
    elif years >= min_years:
        exp_score = min(100, 80 + min(20, (years - min_years) * 5))
    else:
        exp_score = max(10, round(years / min_years * 80))

    # --- Education score (weight 0.05) ---
    edu_list = candidate.get("education") or []
    if not isinstance(edu_list, list):
        edu_list = []
    edu_score = min(100, 60 + len(edu_list) * 15) if edu_list else 45

    # --- Location score (weight 0.05) ---
    job_loc = _normalise(str(job.get("location") or ""))
    cand_loc = _normalise(str(candidate.get("location") or ""))
    if not job_loc or "remote" in job_loc:
        loc_score = 90
    elif cand_loc and (job_loc in cand_loc or cand_loc in job_loc):
        loc_score = 95
    elif cand_loc:
        loc_score = 50
    else:
        loc_score = 60

    components = [
        ScoreComponent(
            key="required_skills",
            label="Required skills coverage",
            weight=0.4,
            score=req_score,
            rationale=f"{len(matched)} of {len(required)} required skills evidenced in the resume."
            if required else "No required skills defined on this role — neutral baseline applied.",
        ),
        ScoreComponent(
            key="experience",
            label="Experience depth",
            weight=0.25,
            score=exp_score,
            rationale=f"{years} years of experience against a {min_years}-year minimum.",
        ),
        ScoreComponent(
            key="nice_to_have",
            label="Bonus skills",
            weight=0.1,
            score=nice_score,
            rationale=f"{len(nice_matched)} of {len(nice)} nice-to-have skills present."
            if nice else "No bonus skills defined — neutral baseline applied.",
        ),
        ScoreComponent(
            key="education",
            label="Education signal",
            weight=0.05,
            score=edu_score,
            rationale=f"{len(edu_list)} qualification(s) parsed. Institution prestige is deliberately not scored."
            if edu_list else "No structured education parsed.",
        ),
        ScoreComponent(
            key="location",
            label="Location / logistics",
            weight=0.05,
            score=loc_score,
            rationale=f"Role based in {job.get('location', 'unspecified')}; candidate in {candidate.get('location') or 'unknown'}."
            if job_loc else "Remote-friendly role.",
        ),
    ]

    return ScoreBreakdown(
        components=components,
        matched=matched,
        missing=missing,
    )


def composite_score(components: List[ScoreComponent]) -> int:
    """Calculate weighted composite score, matching frontend compositeScore()."""
    total_weight = sum(c.weight for c in components) or 1
    weighted = sum(c.weight * c.score for c in components)
    return round(weighted / total_weight)


def dedupe_key(name: str, email: str, phone: str) -> str:
    """Stable dedup key matching frontend dedupeKey()."""
    e = email.lower().strip()
    if e:
        return f"e:{e}"
    p = re.sub(r"\D", "", phone)
    if len(p) >= 8:
        return f"p:{p[-10:]}"
    return f"n:{_normalise(name)}"
