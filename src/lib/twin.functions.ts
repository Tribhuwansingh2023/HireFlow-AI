/**
 * AI Hiring Digital Twin — server function boundary.
 *
 * Every twin is generated from real workspace evidence (resume, applications,
 * screening breakdowns, interviews, feedback, communication, offers) and
 * persisted immutably so every prediction stays reproducible and auditable.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { chatJson, DEFAULT_MODEL } from "./ai-gateway.server";
import { TWIN_MODEL_VERSION, type TwinPayload, type TwinScenario } from "./twin";
import { SYSTEM, evidenceBlock, schemaBrief } from "./twin.server";

export const generateDigitalTwin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { candidateId: string; scenario?: TwinScenario; simulation?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: candidate, error: cErr } = await supabase
      .from("candidates")
      .select("*")
      .eq("id", data.candidateId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!candidate) throw new Error("Candidate not found.");

    const [{ data: applications }, { data: allScores }, { data: profiles }, { data: jobs }, { data: offers }] =
      await Promise.all([
        supabase
          .from("applications")
          .select("*, job:jobs(id,title,seniority,department,location,salary_min,salary_max)")
          .eq("candidate_id", data.candidateId)
          .order("created_at", { ascending: false }),
        supabase.from("applications").select("match_score, status"),
        supabase.from("profiles").select("full_name, title").limit(25),
        supabase.from("jobs").select("title").eq("status", "open").limit(20),
        supabase.from("offers").select("salary, currency, status, current_level, total_levels").limit(20),
      ]);

    const appIds = (applications ?? []).map((a: any) => a.id);
    const [{ data: interviews }, { data: emails }] = await Promise.all([
      appIds.length
        ? supabase.from("interviews").select("*").in("application_id", appIds).order("round_number")
        : Promise.resolve({ data: [] as any[] }),
      appIds.length
        ? supabase.from("emails").select("kind,status,subject").in("application_id", appIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const scores = (allScores ?? []).map((a: any) => Number(a.match_score)).filter((n: number) => !Number.isNaN(n));
    scores.sort((a, b) => a - b);
    const median = scores.length ? Math.round(scores[Math.floor(scores.length / 2)]!) : 0;
    const advanced = (allScores ?? []).filter((a: any) => a.status === "approved").length;

    const ctx = {
      candidate,
      applications: applications ?? [],
      interviews: interviews ?? [],
      emails: emails ?? [],
      offers: offers ?? [],
      team: (profiles ?? []).map((p: any) => `${p.full_name ?? "teammate"}${p.title ? ` (${p.title})` : ""}`),
      benchmarks: {
        total: scores.length,
        median,
        advanceRate: allScores?.length ? Math.round((advanced / allScores.length) * 100) : 0,
        offers: (offers ?? []).length,
        jobTitles: (jobs ?? []).map((j: any) => j.title),
      },
    };

    const payload = await chatJson<TwinPayload>([
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `${evidenceBlock(ctx, data.scenario)}

Return ONLY JSON with exactly this shape:
${schemaBrief()}`,
      },
    ]);

    const latestApp: any = (applications ?? [])[0] ?? null;
    const { data: prev } = await supabase
      .from("candidate_twins")
      .select("version")
      .eq("candidate_id", data.candidateId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const row = {
      candidate_id: data.candidateId,
      application_id: latestApp?.id ?? null,
      job_id: latestApp?.job?.id ?? null,
      version: Number(prev?.version ?? 0) + 1,
      model: DEFAULT_MODEL,
      scenario: (data.scenario ?? {}) as never,
      inputs: {
        model_version: TWIN_MODEL_VERSION,
        applications: (applications ?? []).length,
        interviews: (interviews ?? []).length,
        emails: (emails ?? []).length,
        resume_chars: String(candidate.resume_text ?? "").length,
        skills: (candidate.skills ?? []).length,
        benchmarks: ctx.benchmarks,
        links: candidate.links ?? {},
      } as never,
      dna: (payload.dna ?? []) as never,
      predictions: (payload.predictions ?? []) as never,
      promotion_path: (payload.promotion_path ?? []) as never,
      trajectory: (payload.trajectory ?? []) as never,
      skill_evolution: (payload.skill_evolution ?? []) as never,
      retention: (payload.retention ?? {}) as never,
      burnout: (payload.burnout ?? {}) as never,
      team_chemistry: (payload.team_chemistry ?? {}) as never,
      salary: (payload.salary ?? {}) as never,
      risk: (payload.risk ?? []) as never,
      recruiter_summary: payload.recruiter_summary ?? "",
      overall_confidence: Math.max(0, Math.min(100, Number(payload.overall_confidence) || 0)),
      reliability: payload.reliability ?? "medium",
      is_simulation: Boolean(data.simulation),
      created_by: userId,
    };

    const { data: inserted, error: insErr } = await supabase
      .from("candidate_twins")
      .insert(row)
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);

    await supabase.from("audit_events").insert({
      actor_id: userId,
      actor_type: "agent",
      action: data.simulation ? "twin.simulate" : "twin.generate",
      entity_type: "candidate_twin",
      entity_id: inserted.id,
      job_id: latestApp?.job?.id ?? null,
      summary: data.simulation
        ? `Digital Twin what-if simulation v${row.version} run for ${candidate.full_name}.`
        : `Digital Twin v${row.version} generated for ${candidate.full_name} at ${row.overall_confidence}% confidence (${row.reliability} reliability).`,
      details: {
        model_version: TWIN_MODEL_VERSION,
        version: row.version,
        scenario: data.scenario ?? {},
        evidence: ctx.benchmarks,
      },
      model: DEFAULT_MODEL,
    });

    return inserted;
  });

