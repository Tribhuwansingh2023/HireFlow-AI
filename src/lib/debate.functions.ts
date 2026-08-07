/**
 * AI Recruiter Debate — server function boundary.
 * Listing, replay, human override decisions, agent accuracy analytics and
 * evidence-grounded follow-up questions about a completed debate.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { chatJson, DEFAULT_MODEL } from "./ai-gateway.server";
import { AGENT_BY_KEY, COUNCIL, type AgentKey, type AgentOpinion, type Conflict, type DebateTurn } from "./debate";

/* ---------------------------------------------------------------- */

export const listDebates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("debates")
      .select(
        "id,title,job_id,candidate_ids,candidates,recommendation,consensus,confidence,is_simulation,human_decision,human_override,created_at,latency_ms",
      )
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getDebate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { debateId: string }) => d)
  .handler(async ({ data, context }) => {
    const [{ data: debate, error }, { data: messages }] = await Promise.all([
      context.supabase.from("debates").select("*").eq("id", data.debateId).maybeSingle(),
      context.supabase
        .from("debate_messages")
        .select("*")
        .eq("debate_id", data.debateId)
        .order("created_at", { ascending: true }),
    ]);
    if (error) throw new Error(error.message);
    if (!debate) throw new Error("Debate not found.");
    return { debate, messages: messages ?? [] };
  });

export const listCandidateDebates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { candidateId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: candidate, error: cErr } = await context.supabase
      .from("candidates")
      .select("id, full_name, headline, skills, years_experience, location")
      .eq("id", data.candidateId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);

    const [{ data: debates }, { data: applications }] = await Promise.all([
      context.supabase
        .from("debates")
        .select("*")
        .contains("candidate_ids", [data.candidateId])
        .order("created_at", { ascending: false })
        .limit(20),
      context.supabase
        .from("applications")
        .select("id, job_id, match_score, stage, status, job:jobs(id,title,seniority)")
        .eq("candidate_id", data.candidateId)
        .order("created_at", { ascending: false }),
    ]);
    return { candidate, debates: debates ?? [], applications: applications ?? [] };
  });

/* ---------------------------------------------------------------- */

export const recordDebateDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { debateId: string; decision: "approved" | "rejected" | "overridden"; comment?: string; overrideTo?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: debate, error: gErr } = await supabase
      .from("debates")
      .select("id,title,recommendation,consensus,confidence,candidate_ids,job_id,candidates")
      .eq("id", data.debateId)
      .maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!debate) throw new Error("Debate not found.");

    const isOverride = data.decision === "overridden";
    const decision = isOverride ? (data.overrideTo ?? "overridden") : data.decision;

    const { error } = await supabase
      .from("debates")
      .update({
        human_decision: decision,
        human_comment: data.comment ?? null,
        human_override: isOverride,
        decided_by: userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.debateId);
    if (error) throw new Error(error.message);

    await supabase.from("approvals").insert({
      entity_type: "debate",
      entity_id: data.debateId,
      decision,
      comment: data.comment ?? null,
      previous_value: { ai_recommendation: debate.recommendation, consensus: debate.consensus },
      new_value: { human_decision: decision, override: isOverride },
      decided_by: userId,
    });

    await supabase.from("audit_events").insert({
      actor_id: userId,
      actor_type: "human",
      action: isOverride ? "debate.overridden" : `debate.${data.decision}`,
      entity_type: "debate",
      entity_id: data.debateId,
      job_id: debate.job_id,
      summary: `${isOverride ? "Overrode" : "Confirmed"} the AI council recommendation (${
        debate.recommendation ?? "none"
      }) with "${decision}" on ${debate.title}`,
      details: { comment: data.comment ?? null, ai_recommendation: debate.recommendation, human_decision: decision },
    });

    return { ok: true };
  });

/* ---------------------------------------------------------------- */

export const askDebate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { debateId: string; question: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const question = data.question.trim();
    if (!question) throw new Error("Ask a question first.");

    const { data: debate, error } = await supabase
      .from("debates")
      .select("id,title,opinions,rounds,conflicts,votes,final,consensus,recommendation")
      .eq("id", data.debateId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!debate) throw new Error("Debate not found.");

    const opinions = (debate.opinions ?? []) as AgentOpinion[];
    const rounds = (debate.rounds ?? []) as DebateTurn[];
    const conflicts = (debate.conflicts ?? []) as Conflict[];
    const final = (debate.final ?? {}) as Record<string, unknown>;

    await supabase.from("debate_messages").insert({
      debate_id: data.debateId,
      role: "user",
      content: question,
      created_by: userId,
    });

    const raw = await chatJson<{ answer?: string; evidence?: any[]; agents?: string[]; confidence?: number }>([
      {
        role: "system",
        content: `You are the moderator of a completed AI hiring council session. Answer the recruiter's question strictly from this debate transcript. Quote which agent said what and which evidence they used. If the transcript does not contain the answer, say so plainly. Never invent new facts. Return ONLY JSON.`,
      },
      {
        role: "user",
        content: `TRANSCRIPT — ${debate.title}
Final recommendation: ${debate.recommendation ?? "none"} · consensus ${debate.consensus}%
Final summary: ${JSON.stringify(final).slice(0, 2500)}

OPINIONS
${opinions
  .map(
    (o) =>
      `${AGENT_BY_KEY[o.agent]?.name ?? o.agent}: ${o.verdict} (score ${o.score}, confidence ${o.confidence}%) — ${o.headline}
  arguments: ${o.arguments.join(" | ")}
  evidence: ${o.evidence.map((e) => `${e.source}: ${e.label}`).join(" | ")}
  concerns: ${o.concerns.join(" | ")}`,
  )
  .join("\n")}

CROSS-EXAMINATION
${rounds.map((t) => `R${t.round} ${t.agent} → ${t.target ?? "council"} (${t.stance}): ${t.message}`).join("\n")}

CONFLICTS
${conflicts.map((c) => `${c.topic} [${c.severity}] ${c.agents.join(" vs ")} → ${c.resolution}`).join("\n") || "none"}

QUESTION: ${question}

Return: {"answer":"markdown, 2-6 sentences","evidence":[{"source":"...","label":"...","detail":"..."}],"agents":["agent keys you cited"],"confidence":0-100}`,
      },
    ]);

    const answer = String(raw?.answer ?? "I could not answer that from this transcript.");
    const evidence = (raw?.evidence ?? [])
      .map((e: any) => ({ source: String(e?.source ?? ""), label: String(e?.label ?? ""), detail: e?.detail ? String(e.detail) : undefined }))
      .slice(0, 6);
    const agents = (raw?.agents ?? []).map(String).filter((a: string) => COUNCIL.some((c) => c.key === a));
    const confidence = Math.max(0, Math.min(100, Math.round(Number(raw?.confidence) || 60)));

    const { data: saved } = await supabase
      .from("debate_messages")
      .insert({
        debate_id: data.debateId,
        role: "assistant",
        content: answer,
        evidence,
        agents,
        confidence,
        model: DEFAULT_MODEL,
        created_by: userId,
      })
      .select("*")
      .single();

    return saved;
  });

/* ---------------------------------------------------------------- */

export type AgentAnalytics = {
  agent: AgentKey;
  name: string;
  color: string;
  debates: number;
  avgConfidence: number;
  avgScore: number;
  verdicts: Record<string, number>;
  /** Share of human-decided debates where this agent's verdict matched the human call. */
  agreement: number | null;
  decided: number;
  challenges: number;
};

export const getCouncilAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("debates")
      .select("opinions,rounds,human_decision,human_override,recommendation,consensus,confidence,created_at,is_simulation")
      .order("created_at", { ascending: false })
      .limit(120);
    if (error) throw new Error(error.message);

    const rows = (data ?? []).filter((d: any) => !d.is_simulation);
    const stats = new Map<AgentKey, AgentAnalytics>();
    for (const a of COUNCIL) {
      stats.set(a.key, {
        agent: a.key,
        name: a.short,
        color: a.color,
        debates: 0,
        avgConfidence: 0,
        avgScore: 0,
        verdicts: {},
        agreement: null,
        decided: 0,
        challenges: 0,
      });
    }
    const agreementHits = new Map<AgentKey, number>();

    for (const row of rows as any[]) {
      const humanPositive = row.human_decision
        ? /approv|hire|offer/i.test(row.human_decision)
        : null;
      for (const o of (row.opinions ?? []) as AgentOpinion[]) {
        const s = stats.get(o.agent);
        if (!s) continue;
        s.debates += 1;
        s.avgConfidence += o.confidence;
        s.avgScore += o.score;
        s.verdicts[o.verdict] = (s.verdicts[o.verdict] ?? 0) + 1;
        if (humanPositive !== null) {
          s.decided += 1;
          const agentPositive = o.verdict === "hire" || o.verdict === "strong_hire";
          if (agentPositive === humanPositive) agreementHits.set(o.agent, (agreementHits.get(o.agent) ?? 0) + 1);
        }
      }
      for (const t of (row.rounds ?? []) as DebateTurn[]) {
        if (t.stance === "challenge") {
          const s = stats.get(t.agent);
          if (s) s.challenges += 1;
        }
      }
    }

    const agents = [...stats.values()].map((s) => ({
      ...s,
      avgConfidence: s.debates ? Math.round(s.avgConfidence / s.debates) : 0,
      avgScore: s.debates ? Math.round(s.avgScore / s.debates) : 0,
      agreement: s.decided ? Math.round(((agreementHits.get(s.agent) ?? 0) / s.decided) * 100) : null,
    }));

    const decided = rows.filter((r: any) => r.human_decision);
    return {
      totals: {
        debates: rows.length,
        decided: decided.length,
        overrides: rows.filter((r: any) => r.human_override).length,
        avgConsensus: rows.length
          ? Math.round(rows.reduce((s: number, r: any) => s + Number(r.consensus ?? 0), 0) / rows.length)
          : 0,
        avgConfidence: rows.length
          ? Math.round(rows.reduce((s: number, r: any) => s + Number(r.confidence ?? 0), 0) / rows.length)
          : 0,
      },
      agents,
    };
  });
