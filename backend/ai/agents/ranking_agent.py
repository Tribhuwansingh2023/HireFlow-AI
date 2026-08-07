"""
HireFlow AI — Candidate Ranking Agent.
Takes multiple screened candidates and ranks them against a target job using
the same deterministic scoring as the frontend + LLM-generated explanations.
"""
import json
from typing import List, Dict, Any
from langchain_core.prompts import ChatPromptTemplate

from backend.ai.config import get_llm
from backend.ai.schemas import RankingResult, CandidateRankItem
from backend.ai.scoring import score_candidate, composite_score


RANKING_PROMPT = """You are an expert HR AI Candidate Ranking Agent for HireFlow AI.
Analyze the pre-computed scores for each candidate and provide explainable insights.

Job Title: {job_title}
Job Required Skills: {required_skills}
Job Description (excerpt): {job_description}

Candidates with deterministic scores:
{candidates_json}

For each candidate, provide:
1. key_strengths: 2-3 bullet points on why they are strong
2. areas_of_concern: 1-2 bullet points on gaps or risks
3. reason: A concise 1-2 sentence AI explanation for their ranking position

Return ONLY a JSON array of objects:
[
  {{
    "candidate_name": "...",
    "key_strengths": ["..."],
    "areas_of_concern": ["..."],
    "reason": "..."
  }}
]
Order the array from highest-ranked to lowest-ranked candidate."""


def rank_candidates(
    candidates_data: List[Dict[str, Any]],
    job: Dict[str, Any],
) -> RankingResult:
    """
    Rank multiple candidates against a job description.

    Each candidate in `candidates_data` should have:
      - profile or parsed_profile dict with skills, years_experience, education, etc.
      - resume_text (optional, for scoring)
      - candidate_name or full_name
    """
    # --- Compute deterministic scores for each candidate ---
    scored_candidates = []
    for cand in candidates_data:
        profile = cand.get("parsed_profile") or cand.get("profile") or cand
        cand_dict = {
            "skills": profile.get("skills", []),
            "years_experience": profile.get("years_experience", 0),
            "resume_text": cand.get("resume_text", ""),
            "education": profile.get("education", []),
            "location": profile.get("location", ""),
        }
        breakdown = score_candidate(job, cand_dict)
        total = composite_score(breakdown.components)
        name = (
            cand.get("candidate_name")
            or profile.get("full_name")
            or cand.get("full_name")
            or "Unknown"
        )
        scored_candidates.append({
            "candidate_name": name,
            "candidate_id": cand.get("candidate_id") or cand.get("id"),
            "total_score": total,
            "matched_skills": breakdown.matched,
            "missing_skills": breakdown.missing,
        })

    # Sort by total_score descending
    scored_candidates.sort(key=lambda x: x["total_score"], reverse=True)

    # Assign ranks
    for i, sc in enumerate(scored_candidates):
        sc["rank"] = i + 1

    # --- LLM explanations ---
    llm = get_llm(temperature=0.2)
    try:
        prompt = ChatPromptTemplate.from_template(RANKING_PROMPT)
        chain = prompt | llm
        response = chain.invoke({
            "job_title": job.get("title", "Position"),
            "required_skills": ", ".join(job.get("required_skills", [])),
            "job_description": str(job.get("description", ""))[:3000],
            "candidates_json": json.dumps(scored_candidates, indent=2),
        })

        content = str(response.content)
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        explanations = json.loads(content)
    except Exception:
        explanations = []

    # Merge LLM explanations into scored candidates
    explanations_by_name = {}
    if isinstance(explanations, list):
        for exp in explanations:
            explanations_by_name[exp.get("candidate_name", "")] = exp

    ranking_items = []
    for sc in scored_candidates:
        exp = explanations_by_name.get(sc["candidate_name"], {})
        ranking_items.append(CandidateRankItem(
            candidate_id=sc.get("candidate_id"),
            candidate_name=sc["candidate_name"],
            rank=sc["rank"],
            total_score=sc["total_score"],
            matched_skills=sc["matched_skills"],
            missing_skills=sc["missing_skills"],
            key_strengths=exp.get("key_strengths", [f"Scored {sc['total_score']}/100"]),
            areas_of_concern=exp.get("areas_of_concern", []),
            reason=exp.get("reason", f"Ranked #{sc['rank']} based on weighted skill, experience, and qualification assessment."),
        ))

    return RankingResult(
        job_title=job.get("title", "Position"),
        rankings=ranking_items,
        summary=f"Ranked {len(ranking_items)} candidates for {job.get('title', 'Position')}. "
                f"Top candidate: {ranking_items[0].candidate_name} ({ranking_items[0].total_score}/100)."
        if ranking_items else "No candidates to rank.",
    )
