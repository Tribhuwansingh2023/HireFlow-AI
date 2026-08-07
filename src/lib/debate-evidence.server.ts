/**
 * Evidence loader for the AI hiring council — server-only.
 * Pulls every real workspace signal we hold about a candidate, using the
 * caller's own Supabase client so RLS applies.
 */
import type { CandidateBrief } from "./debate.server";

type Db = {
  from: (table: string) => any;
};

export async function loadDebateEvidence(
  db: Db,
  candidateId: string,
  jobId?: string | null,
): Promise<{ candidate: CandidateBrief; evidence: Record<string, unknown>; jobId: string | null; jobVersion: number | null; applicationIds: string[] }> {
  const { data: candidate, error } = await db.from("candidates").select("*").eq("id", candidateId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!candidate) throw new Error("Candidate not found.");

  const { data: applications } = await db
    .from("applications")
    .select(
      "*, job:jobs(id,title,seniority,department,location,employment_type,description,required_skills,nice_to_have_skills,min_experience_years,salary_min,salary_max,interview_rounds,current_version,status)",
    )
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false });

  const apps = (applications ?? []) as any[];
  const target = jobId ? apps.find((a) => a.job_id === jobId) : apps[0];
  const appIds = apps.map((a) => a.id);

  let job = target?.job ?? null;
  if (!job && jobId) {
    const { data } = await db.from("jobs").select("*").eq("id", jobId).maybeSingle();
    job = data ?? null;
  }

  const [{ data: interviews }, { data: emails }, { data: offers }, { data: sessions }, { data: twinRows }, { data: allScores }, { data: team }] =
    await Promise.all([
      appIds.length
        ? db.from("interviews").select("*").in("application_id", appIds).order("round_number")
        : Promise.resolve({ data: [] }),
      appIds.length
        ? db.from("emails").select("kind,status,subject").in("application_id", appIds)
        : Promise.resolve({ data: [] }),
      appIds.length
        ? db.from("offers").select("salary,currency,equity,status,current_level,total_levels").in("application_id", appIds)
        : Promise.resolve({ data: [] }),
      db
        .from("interview_sessions")
        .select(
          "round_type,difficulty,status,overall_score,recommendation,live_scores,signal_summary,summary,consistency",
        )
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false })
        .limit(4),
      db
        .from("candidate_twins")
        .select("*")
        .eq("candidate_id", candidateId)
        .eq("is_simulation", false)
        .order("created_at", { ascending: false })
        .limit(1),
      db.from("applications").select("match_score,status"),
      db.from("profiles").select("full_name,title").limit(20),
    ]);

  const scores = ((allScores ?? []) as any[])
    .map((a) => Number(a.match_score))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  const median = scores.length ? Math.round(scores[Math.floor(scores.length / 2)] ?? 0) : 0;

  const evidence: Record<string, unknown> = {
    candidate,
    job,
    jobVersion: target?.job_version ?? job?.current_version ?? null,
    applications: apps,
    interviews: interviews ?? [],
    sessions: sessions ?? [],
    emails: emails ?? [],
    offers: offers ?? [],
    twin: (twinRows ?? [])[0] ?? null,
    team: team ?? [],
    benchmarks: {
      workspace_median_match_score: median,
      workspace_applications: scores.length,
      approved_applications: ((allScores ?? []) as any[]).filter((a) => a.status === "approved").length,
    },
  };

  return {
    candidate: {
      id: candidate.id,
      name: candidate.full_name,
      headline: candidate.headline ?? null,
      score: target?.match_score ?? null,
    },
    evidence,
    jobId: job?.id ?? null,
    jobVersion: target?.job_version ?? job?.current_version ?? null,
    applicationIds: appIds,
  };
}
