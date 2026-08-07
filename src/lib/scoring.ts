/**
 * Deterministic, explainable scoring. Runs identically on server and client so
 * recruiters can always reproduce a score without calling a model.
 */

export type ScoreComponent = {
  key: string;
  label: string;
  weight: number;
  score: number;
  rationale: string;
};

export type ScoreBreakdown = {
  components: ScoreComponent[];
  matched: string[];
  missing: string[];
};

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function skillHit(skill: string, candidateSkills: string[], resume: string): boolean {
  const n = normalise(skill);
  if (!n) return false;
  if (candidateSkills.some((cs) => normalise(cs) === n || normalise(cs).includes(n))) return true;
  return resume.includes(n);
}

type JobLike = {
  required_skills?: string[] | null;
  nice_to_have_skills?: string[] | null;
  min_experience_years?: number | null;
  seniority?: string | null;
  location?: string | null;
};

type CandidateLike = {
  skills?: string[] | null;
  years_experience?: number | null;
  resume_text?: string | null;
  education?: unknown;
  location?: string | null;
};

export function scoreCandidate(job: JobLike, candidate: CandidateLike): ScoreBreakdown {
  const resume = normalise(String(candidate.resume_text ?? ""));
  const candSkills = (candidate.skills ?? []).map(String);
  const required = (job.required_skills ?? []).map(String).filter(Boolean);
  const nice = (job.nice_to_have_skills ?? []).map(String).filter(Boolean);

  const matched: string[] = [];
  const missing: string[] = [];
  required.forEach((s) => (skillHit(s, candSkills, resume) ? matched : missing).push(s));
  const niceMatched = nice.filter((s) => skillHit(s, candSkills, resume));

  const reqScore = required.length ? Math.round((matched.length / required.length) * 100) : 70;
  const niceScore = nice.length ? Math.round((niceMatched.length / nice.length) * 100) : 60;

  const minYears = Number(job.min_experience_years ?? 0);
  const years = Number(candidate.years_experience ?? 0);
  let expScore: number;
  if (minYears <= 0) expScore = 75;
  else if (years >= minYears) expScore = Math.min(100, 80 + Math.min(20, (years - minYears) * 5));
  else expScore = Math.max(10, Math.round((years / minYears) * 80));

  const eduList = Array.isArray(candidate.education) ? candidate.education : [];
  const eduScore = eduList.length ? Math.min(100, 60 + eduList.length * 15) : 45;

  const jobLoc = normalise(String(job.location ?? ""));
  const candLoc = normalise(String(candidate.location ?? ""));
  let locScore = 60;
  if (!jobLoc || jobLoc.includes("remote")) locScore = 90;
  else if (candLoc && (jobLoc.includes(candLoc) || candLoc.includes(jobLoc.split(" ")[0] ?? "@"))) locScore = 95;
  else if (candLoc) locScore = 50;

  return {
    matched,
    missing,
    components: [
      {
        key: "required_skills",
        label: "Required skills coverage",
        weight: 0.4,
        score: reqScore,
        rationale: required.length
          ? `${matched.length} of ${required.length} required skills evidenced in the resume.`
          : "No required skills defined on this role — neutral baseline applied.",
      },
      {
        key: "experience",
        label: "Experience depth",
        weight: 0.25,
        score: expScore,
        rationale: `${years} years of experience against a ${minYears}-year minimum.`,
      },
      {
        key: "nice_to_have",
        label: "Bonus skills",
        weight: 0.1,
        score: niceScore,
        rationale: nice.length
          ? `${niceMatched.length} of ${nice.length} nice-to-have skills present.`
          : "No bonus skills defined — neutral baseline applied.",
      },
      {
        key: "education",
        label: "Education signal",
        weight: 0.05,
        score: eduScore,
        rationale: eduList.length
          ? `${eduList.length} qualification(s) parsed. Institution prestige is deliberately not scored.`
          : "No structured education parsed.",
      },
      {
        key: "location",
        label: "Location / logistics",
        weight: 0.05,
        score: locScore,
        rationale: jobLoc ? `Role based in ${job.location}; candidate in ${candidate.location || "unknown"}.` : "Remote-friendly role.",
      },
    ],
  };
}

export function compositeScore(components: ScoreComponent[]): number {
  const w = components.reduce((s, c) => s + c.weight, 0) || 1;
  return Math.round(components.reduce((s, c) => s + c.weight * c.score, 0) / w);
}

/** Stable key used to detect duplicate candidates across uploads. */
export function dedupeKey(name: string, email: string, phone: string): string {
  const e = email.toLowerCase().trim();
  if (e) return `e:${e}`;
  const p = phone.replace(/\D/g, "");
  if (p.length >= 8) return `p:${p.slice(-10)}`;
  return `n:${normalise(name)}`;
}
