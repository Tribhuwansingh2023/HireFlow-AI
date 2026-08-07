/**
 * Digital Twin prompt construction — server-only helpers.
 */
import { DNA_DIMENSIONS, PREDICTION_KEYS, type TwinScenario } from "./twin";

export const SYSTEM = `You are HireFlow's Digital Twin inference engine — a calibrated hiring-outcome model.
You forecast the future performance of a candidate from the workspace evidence supplied.

HARD RULES
- Use ONLY the supplied evidence. Never infer from name, gender, age, nationality, ethnicity, marital status, photo or university prestige, and never cite them.
- Every number is a calibrated 0-100 integer. Be honest: sparse evidence means lower confidence, not lower scores.
- Cite concrete evidence strings taken from the supplied data (e.g. "screening score 78/100", "resume: led migration to Kubernetes").
- Burnout Risk and every risk factor are RISK scores: higher = worse.
- Return ONLY JSON matching the requested schema. No markdown, no commentary.`;

export function schemaBrief(): string {
  return `{
 "dna":[{"dimension":one of ${JSON.stringify(DNA_DIMENSIONS)},"score":0-100,"confidence":0-100,"rationale":"1 sentence","evidence":["..."]}] (all 10, in that order),
 "predictions":[{"key":one of ${JSON.stringify(PREDICTION_KEYS)},"value":0-100,"confidence":0-100,"reasoning":"2 sentences","evidence":["2-4 evidence strings"],"features":[{"name":"...","weight":0-1,"direction":"positive"|"negative"}],"decision_path":["3-5 short inference steps"]}] (all 15),
 "promotion_path":[{"role":"...","eta_years":number,"probability":0-100,"rationale":"1 sentence"}] (3-4 steps beyond the current role),
 "trajectory":[{"stage":"education"|"internship"|"current"|"next"|"promotion"|"leadership","label":"...","period":"...","explanation":"why this transition happens"}],
 "skill_evolution":[{"skill":"...","now":0-100,"projected":0-100,"horizon_months":number,"rationale":"..."}] (5-7 real skills from the evidence),
 "retention":{"six_months":0-100,"one_year":0-100,"two_years":0-100,"drivers":[{"factor":"Salary"|"Career Growth"|"Work Culture"|"Learning"|"Manager"|"Work-life balance","impact":-100..100,"note":"..."}] (all six)},
 "burnout":{"risk":0-100,"mental_workload":0-100,"context_switching":0-100,"stress":0-100,"level":"low"|"moderate"|"elevated"|"high","recovery":["3 actions"]},
 "team_chemistry":{"best_match":"team or person from the supplied workspace context","compatibility":0-100,"reasons":[{"factor":"Communication"|"Technical overlap"|"Personality"|"Working style","score":0-100,"note":"..."}]},
 "salary":{"market_value":number,"expected":number,"budget":number,"currency":"USD","satisfaction":0-100,"negotiation_difficulty":"low"|"medium"|"high","acceptance_probability":0-100,"note":"..."},
 "risk":[{"factor":"Resume Fraud Risk"|"Employment Gap Risk"|"Skill Inflation"|"Fake Certificate Risk"|"Project Authenticity","score":0-100,"level":"low"|"medium"|"high","note":"..."}] (all five),
 "recruiter_summary":"5-7 sentences ending with a recommended hiring priority",
 "overall_confidence":0-100,
 "reliability":"low"|"medium"|"high"
}`;
}

export function evidenceBlock(ctx: any, scenario: TwinScenario | undefined): string {
  const c = ctx.candidate;
  const apps = ctx.applications ?? [];
  const interviews = ctx.interviews ?? [];
  const emails = ctx.emails ?? [];
  const links = (c.links ?? {}) as Record<string, string>;

  return `CANDIDATE
Headline: ${c.headline ?? "n/a"}
Experience: ${c.years_experience} years
Location: ${c.location ?? "n/a"}
Skills: ${(c.skills ?? []).join(", ") || "none parsed"}
Education: ${JSON.stringify(c.education ?? [])}
Work history: ${JSON.stringify(c.work_history ?? [])}
Public profiles (GitHub / portfolio / LinkedIn signals): ${JSON.stringify(links)}
Resume excerpt: ${String(c.resume_text ?? "").slice(0, 7000)}

APPLICATIONS & SCREENING (deterministic + AI scores already recorded in this workspace)
${
  apps.length
    ? apps
        .map(
          (a: any) =>
            `- ${a.job?.title ?? "role"} (${a.job?.seniority ?? "n/a"}) · stage ${a.stage} · status ${a.status} · score ${a.match_score ?? "n/a"}/100 · rec ${a.ai_recommendation ?? "n/a"} · matched [${(a.matched_skills ?? []).join(", ")}] · missing [${(a.missing_skills ?? []).join(", ")}] · summary: ${String(a.ai_summary ?? "").slice(0, 600)}`,
        )
        .join("\n")
    : "- none yet"
}

INTERVIEWS & FEEDBACK
${
  interviews.length
    ? interviews
        .map(
          (i: any) =>
            `- Round ${i.round_number} ${i.round_name} · status ${i.status} · rating ${i.feedback_rating ?? "n/a"}/5 · notes: ${String(i.feedback_notes ?? "").slice(0, 500)} · summary: ${String(i.feedback_summary ?? "").slice(0, 400)}`,
        )
        .join("\n")
    : "- none yet"
}

COMMUNICATION QUALITY SIGNALS (recruiter correspondence to date)
${emails.length ? emails.map((e: any) => `- ${e.kind} · ${e.status} · "${String(e.subject ?? "").slice(0, 120)}"`).join("\n") : "- none yet"}

OFFERS
${(ctx.offers ?? []).length ? (ctx.offers ?? []).map((o: any) => `- ${o.currency} ${o.salary ?? "n/a"} · status ${o.status} · level ${o.current_level}/${o.total_levels}`).join("\n") : "- none yet"}

HISTORICAL HIRING BENCHMARKS (this workspace)
Screened candidates: ${ctx.benchmarks.total} · median screening score: ${ctx.benchmarks.median} · advance rate: ${ctx.benchmarks.advanceRate}% · hired/offer-approved: ${ctx.benchmarks.offers}
Open roles the twin can be matched against: ${ctx.benchmarks.jobTitles.join(", ") || "none"}
Existing team (for chemistry): ${ctx.team.join(", ") || "no profiles"}

${
  scenario && Object.keys(scenario).length
    ? `WHAT-IF SIMULATION OVERRIDES — re-forecast as if these were true of the candidate, and say so in the reasoning:
${Object.entries(scenario)
  .map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${v}`)
  .join("\n")}`
    : "No simulation overrides — this is the baseline twin."
}`;
}
