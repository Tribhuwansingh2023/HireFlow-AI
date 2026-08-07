/**
 * AI Recruiter Debate — the multi-agent hiring council engine (server-only).
 *
 * Execution is a LangGraph-style state graph: a typed state object flows
 * through explicit nodes, each node is a real model call with its own role
 * prompt, and every transition is recorded so the whole run can be replayed,
 * explained and audited. Nothing here is hardcoded — every argument, number
 * and citation is produced by an agent from the workspace evidence.
 *
 *   evidence → [10 specialist agents] → cross-examination → conflicts
 *            → weighted voting → final decision agent
 */
import { chatJson, DEFAULT_MODEL } from "./ai-gateway.server";
import {
  AGENT_BY_KEY,
  COUNCIL,
  COUNCIL_VERSION,
  computeConsensus,
  tally,
  weightedVerdict,
  type AgentKey,
  type AgentOpinion,
  type Conflict,
  type CouncilVote,
  type DebateScenario,
  type DebateTurn,
  type FinalDecision,
  type ReasoningGraph,
  type Verdict,
} from "./debate";

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export type DebateEmit = (event: Record<string, unknown>) => void;

export type CandidateBrief = {
  id: string;
  name: string;
  headline: string | null;
  score: number | null;
};

export type GraphState = {
  candidates: CandidateBrief[];
  evidence: Record<string, unknown>;
  evidenceText: string;
  opinions: AgentOpinion[];
  rounds: DebateTurn[];
  conflicts: Conflict[];
  votes: CouncilVote[];
  consensus: number;
  final: FinalDecision | null;
  timeline: Array<{ node: string; label: string; agent: AgentKey | null; ms: number; summary: string }>;
};

const GUARDRAILS = `HARD RULES
- Reason ONLY from the supplied workspace evidence. If evidence is missing for something, say so in data_gaps and lower your confidence — never invent a fact, a repository, a score or a quote.
- Never reference or infer name origin, gender, age, nationality, ethnicity, religion, marital status, photo or university prestige. Fair-hiring compliance is mandatory.
- Every evidence entry must quote something that actually appears in the evidence block (e.g. "screening score 78/100", "interview round 2 feedback: ...", "resume: led migration to Kubernetes").
- Calibrate: sparse evidence means lower confidence, not a lower score.
- Return ONLY JSON. No markdown fences, no commentary.`;

/* ------------------------------------------------------------------ */
/* Node 1 — evidence assembly                                          */
/* ------------------------------------------------------------------ */

export function buildEvidenceText(evidence: any, scenario: DebateScenario | undefined): string {
  const c = evidence.candidate;
  const job = evidence.job;
  const twin = evidence.twin;
  const links = (c?.links ?? {}) as Record<string, string>;

  const apps = (evidence.applications ?? []) as any[];
  const interviews = (evidence.interviews ?? []) as any[];
  const sessions = (evidence.sessions ?? []) as any[];
  const offers = (evidence.offers ?? []) as any[];
  const emails = (evidence.emails ?? []) as any[];

  const lines: string[] = [];

  lines.push(`### CANDIDATE
Name reference: candidate ${c?.id}
Headline: ${c?.headline ?? "n/a"}
Experience: ${c?.years_experience ?? 0} years
Location: ${c?.location ?? "n/a"}
Skills parsed: ${(c?.skills ?? []).join(", ") || "none parsed"}
Education: ${JSON.stringify(c?.education ?? []).slice(0, 700)}
Work history: ${JSON.stringify(c?.work_history ?? []).slice(0, 1400)}
Links (GitHub / portfolio / other): ${JSON.stringify(links)}
Resume source: ${c?.source ?? "unknown"}${c?.ocr_used ? " (OCR used)" : ""}
Resume excerpt: ${String(c?.resume_text ?? "").slice(0, 2600) || "no resume text stored"}`);

  if (job) {
    lines.push(`### ROLE (job version ${evidence.jobVersion ?? job.current_version ?? 1})
Title: ${job.title} · ${job.seniority ?? "n/a"} · ${job.department ?? "n/a"} · ${job.location ?? "n/a"} · ${job.employment_type}
Required skills: ${(job.required_skills ?? []).join(", ") || "n/a"}
Nice to have: ${(job.nice_to_have_skills ?? []).join(", ") || "n/a"}
Minimum experience: ${job.min_experience_years ?? 0} years
Salary band: ${job.salary_min ?? "?"} - ${job.salary_max ?? "?"}
Interview rounds: ${job.interview_rounds}
Description: ${String(job.description ?? "").slice(0, 1600)}`);
  } else {
    lines.push("### ROLE\nNo job attached to this debate — evaluate against the candidate's stated target role only.");
  }

  lines.push(`### SCREENING / APPLICATIONS (${apps.length})
${
  apps.length
    ? apps
        .map(
          (a) =>
            `- ${a.job?.title ?? "role"} · stage ${a.stage} · status ${a.status} · match ${a.match_score ?? "n/a"}/100
  matched: ${(a.matched_skills ?? []).join(", ") || "none"}
  missing: ${(a.missing_skills ?? []).join(", ") || "none"}
  breakdown: ${JSON.stringify(a.score_breakdown ?? {}).slice(0, 500)}
  AI summary: ${String(a.ai_summary ?? "").slice(0, 500)}
  AI recommendation: ${a.ai_recommendation ?? "n/a"} (confidence ${a.ai_confidence ?? "n/a"})
  bias notes: ${JSON.stringify(a.bias_notes ?? {}).slice(0, 300)}`,
        )
        .join("\n")
    : "no applications on record"
}`);

  lines.push(`### INTERVIEWS (${interviews.length})
${
  interviews.length
    ? interviews
        .map(
          (i) =>
            `- Round ${i.round_number} ${i.round_name} · ${i.status} · rating ${i.feedback_rating ?? "n/a"}/5
  questions: ${JSON.stringify(i.questions ?? []).slice(0, 400)}
  feedback: ${String(i.feedback_summary ?? i.feedback_notes ?? "none recorded").slice(0, 600)}`,
        )
        .join("\n")
    : "no interviews on record"
}`);

  lines.push(`### AI INTERVIEW SIMULATOR SESSIONS (${sessions.length})
${
  sessions.length
    ? sessions
        .map(
          (s) =>
            `- ${s.round_type} · ${s.difficulty} · ${s.status} · overall ${s.overall_score ?? "n/a"}/100 · recommendation ${s.recommendation ?? "n/a"}
  live scores: ${JSON.stringify(s.live_scores ?? {}).slice(0, 400)}
  signals: ${JSON.stringify(s.signal_summary ?? {}).slice(0, 400)}
  summary: ${JSON.stringify(s.summary ?? {}).slice(0, 700)}
  consistency: ${JSON.stringify(s.consistency ?? {}).slice(0, 300)}`,
        )
        .join("\n")
    : "no simulator sessions on record"
}`);

  lines.push(`### DIGITAL TWIN FORECAST
${
  twin
    ? `version ${twin.version} · confidence ${twin.overall_confidence}% · reliability ${twin.reliability}
DNA: ${JSON.stringify(twin.dna ?? []).slice(0, 1200)}
Predictions: ${JSON.stringify(twin.predictions ?? []).slice(0, 1800)}
Promotion path: ${JSON.stringify(twin.promotion_path ?? []).slice(0, 500)}
Retention: ${JSON.stringify(twin.retention ?? {}).slice(0, 400)}
Burnout: ${JSON.stringify(twin.burnout ?? {}).slice(0, 300)}
Salary model: ${JSON.stringify(twin.salary ?? {}).slice(0, 400)}
Risk model: ${JSON.stringify(twin.risk ?? []).slice(0, 500)}
Summary: ${String(twin.recruiter_summary ?? "").slice(0, 600)}`
    : "no Digital Twin has been generated for this candidate — the Digital Twin Agent must report this as a data gap and cap its confidence at 40."
}`);

  lines.push(`### OFFERS & COMPENSATION CONTEXT
Offers on record: ${JSON.stringify(offers).slice(0, 600) || "none"}
Workspace benchmarks: ${JSON.stringify(evidence.benchmarks ?? {})}
Team context: ${JSON.stringify(evidence.team ?? [])}`);

  lines.push(`### COMMUNICATION LOG (${emails.length})
${emails.map((e) => `- ${e.kind} · ${e.status} · ${e.subject}`).join("\n") || "no emails on record"}`);

  if (scenario && Object.keys(scenario).length) {
    lines.push(`### WHAT-IF OVERRIDES (hypothetical, applied on top of the real evidence)
${scenario.extra_experience ? `- Add ${scenario.extra_experience} years of relevant experience\n` : ""}${
      scenario.add_certification ? `- Candidate now holds: ${scenario.add_certification}\n` : ""
    }${scenario.interview_boost ? `- Interview/communication scores shifted by ${scenario.interview_boost} points\n` : ""}${
      scenario.salary_delta ? `- Salary expectation shifted by ${scenario.salary_delta}%\n` : ""
    }${scenario.remote !== undefined ? `- Working mode: ${scenario.remote ? "fully remote" : "on-site"}\n` : ""}${
      scenario.note ? `- Recruiter note: ${scenario.note}\n` : ""
    }Treat these as simulated. State clearly in your reasoning when a verdict depends on a simulated change.`);
  }

  return lines.join("\n\n");
}

/* ------------------------------------------------------------------ */
/* Node 2..11 — specialist agents                                      */
/* ------------------------------------------------------------------ */

const OPINION_SCHEMA = `{
 "verdict":"strong_hire"|"hire"|"hold"|"reject",
 "score":0-100 (how strongly the candidate satisfies THIS agent's mandate),
 "confidence":0-100 (how much the available evidence supports your verdict),
 "headline":"one sentence, max 110 chars, the position you would state out loud in the room",
 "reasoning":"3-4 sentences of calibrated analysis",
 "arguments":["3-5 crisp bullet arguments"],
 "evidence":[{"source":"resume"|"screening"|"interview"|"simulator"|"twin"|"github"|"portfolio"|"job"|"offers"|"emails"|"benchmarks","label":"the exact fact you used","detail":"why it matters"}],
 "concerns":["0-3 specific concerns"],
 "supporting_data":[{"label":"metric name","value":"the number or fact"}],
 "decision_path":["3-5 short inference steps that lead from evidence to verdict"],
 "data_gaps":["evidence you needed but did not have"]
}`;

async function runAgent(
  key: AgentKey,
  evidenceText: string,
  candidate: CandidateBrief,
): Promise<AgentOpinion> {
  const agent = AGENT_BY_KEY[key];
  const started = Date.now();
  const raw = await chatJson<any>([
    {
      role: "system",
      content: `You are the ${agent.name} on HireFlow's AI hiring council. You are one of ten specialists; you do NOT decide the hire, you argue your mandate honestly and let the council weigh it.

YOUR MANDATE
${agent.mandate}
You evaluate: ${agent.evaluates.join(", ")}.
Evidence you may lean on: ${agent.sources.join(", ")}.
Stay in your lane — do not grade areas owned by other agents; reference them only where they change your own conclusion.

${GUARDRAILS}`,
    },
    {
      role: "user",
      content: `Evaluate this candidate for the council.

${evidenceText}

Return ONLY JSON with this shape:
${OPINION_SCHEMA}`,
    },
  ]);

  const clamp = (n: unknown, fallback = 0) => Math.max(0, Math.min(100, Math.round(Number(n) || fallback)));
  return {
    agent: key,
    candidateId: candidate.id,
    verdict: (["strong_hire", "hire", "hold", "reject"] as Verdict[]).includes(raw?.verdict)
      ? raw.verdict
      : "hold",
    score: clamp(raw?.score, 50),
    confidence: clamp(raw?.confidence, 50),
    headline: String(raw?.headline ?? "").slice(0, 200),
    reasoning: String(raw?.reasoning ?? ""),
    arguments: (raw?.arguments ?? []).map(String).slice(0, 6),
    evidence: (raw?.evidence ?? [])
      .filter((e: any) => e && (e.label || e.detail))
      .map((e: any) => ({
        source: String(e.source ?? "resume"),
        label: String(e.label ?? ""),
        detail: e.detail ? String(e.detail) : undefined,
      }))
      .slice(0, 8),
    concerns: (raw?.concerns ?? []).map(String).slice(0, 4),
    supporting_data: (raw?.supporting_data ?? [])
      .map((d: any) => ({ label: String(d?.label ?? ""), value: String(d?.value ?? "") }))
      .slice(0, 6),
    decision_path: (raw?.decision_path ?? []).map(String).slice(0, 6),
    sources_used: Array.from(new Set((raw?.evidence ?? []).map((e: any) => String(e?.source ?? "")))).filter(
      Boolean,
    ) as string[],
    data_gaps: (raw?.data_gaps ?? []).map(String).slice(0, 4),
    ms: Date.now() - started,
  };
}

/* ------------------------------------------------------------------ */
/* Node 12 — cross-examination                                         */
/* ------------------------------------------------------------------ */

function opinionDigest(opinions: AgentOpinion[]): string {
  return opinions
    .map(
      (o) =>
        `${AGENT_BY_KEY[o.agent].name} [${o.agent}] → ${o.verdict.toUpperCase()} · score ${o.score} · confidence ${o.confidence}%
  position: ${o.headline}
  arguments: ${o.arguments.join(" | ")}
  concerns: ${o.concerns.join(" | ") || "none"}
  evidence: ${o.evidence.map((e) => `${e.source}: ${e.label}`).join(" | ") || "none"}
  gaps: ${o.data_gaps.join(" | ") || "none"}`,
    )
    .join("\n\n");
}

async function runCrossExamination(
  opinions: AgentOpinion[],
  evidenceText: string,
  candidateId: string,
): Promise<DebateTurn[]> {
  const raw = await chatJson<{ turns?: any[] }>([
    {
      role: "system",
      content: `You are the moderator of HireFlow's AI hiring council. You now run a two-round cross-examination between the specialist agents who have already filed their opinions.

Rules for the exchange:
- Only the ten council agents speak. Every turn must be attributed to one of these keys: ${COUNCIL.map((a) => a.key).join(", ")}.
- Agents challenge the agents they actually disagree with, quoting the specific evidence in dispute. Agreement turns are allowed only when they add new evidence.
- An agent may concede and revise its confidence or verdict; when it does, set revised_confidence and/or revised_verdict.
- Round 1: the strongest disagreements. Round 2: responses, concessions and resolution attempts.
- 8 to 14 turns total. Each message is 1-3 sentences, spoken in the first person, professional boardroom tone.

${GUARDRAILS}`,
    },
    {
      role: "user",
      content: `FILED OPINIONS
${opinionDigest(opinions)}

EVIDENCE ON THE TABLE
${evidenceText.slice(0, 9000)}

Return ONLY JSON:
{"turns":[{"round":1|2,"agent":"<agent key>","target":"<agent key or null>","stance":"support"|"challenge"|"concede"|"clarify","message":"...","evidence":[{"source":"...","label":"...","detail":"..."}],"confidence":0-100,"revised_confidence":0-100|null,"revised_verdict":"strong_hire"|"hire"|"hold"|"reject"|null}]}`,
    },
  ]);

  const keys = COUNCIL.map((a) => a.key) as string[];
  return (raw?.turns ?? [])
    .filter((t: any) => keys.includes(t?.agent))
    .map((t: any) => ({
      round: Number(t.round) === 2 ? 2 : 1,
      agent: t.agent as AgentKey,
      target: keys.includes(t?.target) ? (t.target as AgentKey) : null,
      stance: ["support", "challenge", "concede", "clarify"].includes(t?.stance) ? t.stance : "clarify",
      candidateId,
      message: String(t.message ?? ""),
      evidence: (t.evidence ?? [])
        .map((e: any) => ({
          source: String(e?.source ?? "resume"),
          label: String(e?.label ?? ""),
          detail: e?.detail ? String(e.detail) : undefined,
        }))
        .slice(0, 4),
      confidence: Math.max(0, Math.min(100, Math.round(Number(t.confidence) || 0))),
      revised_confidence:
        t.revised_confidence === null || t.revised_confidence === undefined
          ? null
          : Math.max(0, Math.min(100, Math.round(Number(t.revised_confidence)))),
      revised_verdict: ["strong_hire", "hire", "hold", "reject"].includes(t?.revised_verdict)
        ? (t.revised_verdict as Verdict)
        : null,
    }))
    .slice(0, 16);
}

/* ------------------------------------------------------------------ */
/* Node 13 — disagreement detection                                    */
/* ------------------------------------------------------------------ */

async function detectConflicts(opinions: AgentOpinion[], rounds: DebateTurn[]): Promise<Conflict[]> {
  const raw = await chatJson<{ conflicts?: any[] }>([
    {
      role: "system",
      content: `You are HireFlow's council analyst. You isolate genuine disagreements between agents — not stylistic differences. For each conflict, state exactly which evidence points in opposite directions and how a recruiter could resolve it with one concrete next step.

${GUARDRAILS}`,
    },
    {
      role: "user",
      content: `OPINIONS
${opinionDigest(opinions)}

CROSS-EXAMINATION
${rounds.map((t) => `R${t.round} ${t.agent} → ${t.target ?? "council"} (${t.stance}): ${t.message}`).join("\n")}

Return ONLY JSON:
{"conflicts":[{"topic":"short title","agents":["key","key"],"positions":[{"agent":"key","position":"one line"}],"conflicting_evidence":["the two or more facts that clash"],"confidence_delta":0-100,"severity":"low"|"medium"|"high","resolution":"the concrete action or evidence that settles it","resolved_by":"agent key or null"}]}
Return 0-4 conflicts, most material first. If the council genuinely agrees, return an empty array.`,
    },
  ]);

  const keys = COUNCIL.map((a) => a.key) as string[];
  return (raw?.conflicts ?? [])
    .map((c: any) => ({
      topic: String(c?.topic ?? "Disagreement"),
      agents: (c?.agents ?? []).filter((a: any) => keys.includes(a)) as AgentKey[],
      positions: (c?.positions ?? [])
        .filter((p: any) => keys.includes(p?.agent))
        .map((p: any) => ({ agent: p.agent as AgentKey, position: String(p.position ?? "") })),
      conflicting_evidence: (c?.conflicting_evidence ?? []).map(String).slice(0, 5),
      confidence_delta: Math.max(0, Math.min(100, Math.round(Number(c?.confidence_delta) || 0))),
      severity: ["low", "medium", "high"].includes(c?.severity) ? c.severity : "medium",
      resolution: String(c?.resolution ?? ""),
      resolved_by: keys.includes(c?.resolved_by) ? (c.resolved_by as AgentKey) : null,
    }))
    .slice(0, 4);
}

/* ------------------------------------------------------------------ */
/* Node 14 — weighted voting (deterministic)                           */
/* ------------------------------------------------------------------ */

function buildVotes(opinions: AgentOpinion[], rounds: DebateTurn[]): CouncilVote[] {
  return opinions.map((o) => {
    const revisions = rounds.filter((t) => t.agent === o.agent);
    const lastVerdict = [...revisions].reverse().find((t) => t.revised_verdict)?.revised_verdict ?? null;
    const lastConfidence = [...revisions].reverse().find((t) => typeof t.revised_confidence === "number")
      ?.revised_confidence;
    const verdict = lastVerdict ?? o.verdict;
    const confidence = typeof lastConfidence === "number" ? lastConfidence : o.confidence;
    return {
      agent: o.agent,
      candidateId: o.candidateId,
      verdict,
      confidence,
      weight: AGENT_BY_KEY[o.agent].weight,
      note: lastVerdict
        ? `Revised during cross-examination from ${o.verdict.replace("_", " ")} to ${verdict.replace("_", " ")}.`
        : o.headline,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Node 15 — final decision agent                                      */
/* ------------------------------------------------------------------ */

async function runFinalAgent(args: {
  opinions: AgentOpinion[];
  rounds: DebateTurn[];
  conflicts: Conflict[];
  votes: CouncilVote[];
  consensus: number;
  mathVerdict: Verdict;
  candidate: CandidateBrief;
  evidenceText: string;
}): Promise<FinalDecision> {
  const counts = tally(args.votes)
    .map((t) => `${t.verdict}: ${t.count} votes (weight ${t.weight})`)
    .join(" · ");

  const raw = await chatJson<any>([
    {
      role: "system",
      content: `You are the Final Decision Agent of HireFlow's AI hiring council. You do NOT score the candidate yourself. You aggregate the council: weigh each specialist by mandate weight and stated confidence, take dissent seriously, and produce one defensible recommendation a hiring committee could sign.

- The weighted council maths already produced "${args.mathVerdict}" at ${args.consensus}% consensus. Adopt it unless a material risk or compliance blocker justifies overriding it — if you override, say why explicitly in the summary.
- Confidence must reflect consensus AND evidence quality. Low consensus or thin evidence caps confidence below 70.
- Name the dissenting agents and what would change their mind.

${GUARDRAILS}`,
    },
    {
      role: "user",
      content: `COUNCIL OPINIONS
${opinionDigest(args.opinions)}

CROSS-EXAMINATION
${args.rounds.map((t) => `R${t.round} ${t.agent} → ${t.target ?? "council"} (${t.stance}): ${t.message}`).join("\n")}

CONFLICTS
${args.conflicts.map((c) => `${c.topic} [${c.severity}] ${c.agents.join(" vs ")} → ${c.resolution}`).join("\n") || "none"}

VOTE TALLY
${counts}
Weighted consensus: ${args.consensus}%

EVIDENCE
${args.evidenceText.slice(0, 6000)}

Return ONLY JSON:
{
 "recommendation":"strong_hire"|"hire"|"hold"|"reject",
 "confidence":0-100,
 "summary":"5-7 sentences a hiring committee could sign",
 "reasons":["4-6 decisive reasons, each citing evidence"],
 "evidence":[{"source":"...","label":"...","detail":"..."}],
 "business_impact":"2-3 sentences on what this hire unlocks or costs",
 "risk_analysis":"2-3 sentences on the material risks and their mitigations",
 "expected_roi":"1-2 sentences with the economics as far as evidence allows",
 "promotion_probability":0-100,
 "retention_prediction":0-100,
 "dissent":["which agent disagrees and what would change its mind"],
 "conditions":["conditions that must be met before an offer"],
 "next_actions":["3-4 concrete recruiter next steps"],
 "decision_path":["5-7 steps from evidence to final recommendation"]
}`,
    },
  ]);

  const clamp = (n: unknown, f = 0) => Math.max(0, Math.min(100, Math.round(Number(n) || f)));
  return {
    candidateId: args.candidate.id,
    recommendation: (["strong_hire", "hire", "hold", "reject"] as Verdict[]).includes(raw?.recommendation)
      ? raw.recommendation
      : args.mathVerdict,
    confidence: clamp(raw?.confidence, Math.round(args.consensus * 0.8)),
    consensus: args.consensus,
    summary: String(raw?.summary ?? ""),
    reasons: (raw?.reasons ?? []).map(String).slice(0, 8),
    evidence: (raw?.evidence ?? [])
      .map((e: any) => ({
        source: String(e?.source ?? "resume"),
        label: String(e?.label ?? ""),
        detail: e?.detail ? String(e.detail) : undefined,
      }))
      .slice(0, 8),
    business_impact: String(raw?.business_impact ?? ""),
    risk_analysis: String(raw?.risk_analysis ?? ""),
    expected_roi: String(raw?.expected_roi ?? ""),
    promotion_probability: clamp(raw?.promotion_probability, 50),
    retention_prediction: clamp(raw?.retention_prediction, 50),
    dissent: (raw?.dissent ?? []).map(String).slice(0, 5),
    conditions: (raw?.conditions ?? []).map(String).slice(0, 5),
    next_actions: (raw?.next_actions ?? []).map(String).slice(0, 5),
    decision_path: (raw?.decision_path ?? []).map(String).slice(0, 8),
  };
}

/* ------------------------------------------------------------------ */
/* Reasoning graph (deterministic, built from the run)                 */
/* ------------------------------------------------------------------ */

export function buildReasoningGraph(
  opinions: AgentOpinion[],
  conflicts: Conflict[],
  final: FinalDecision | null,
): ReasoningGraph {
  const nodes: ReasoningGraph["nodes"] = [];
  const edges: ReasoningGraph["edges"] = [];
  const seen = new Set<string>();

  for (const o of opinions) {
    const agentId = `agent:${o.agent}`;
    nodes.push({ id: agentId, label: AGENT_BY_KEY[o.agent].short, kind: "agent", weight: o.confidence });
    for (const e of o.evidence.slice(0, 3)) {
      const id = `evidence:${e.source}`;
      if (!seen.has(id)) {
        seen.add(id);
        nodes.push({ id, label: e.source, kind: "evidence", weight: 60 });
      }
      edges.push({ from: id, to: agentId, kind: "informs", weight: 1 });
    }
    edges.push({
      from: agentId,
      to: "decision:final",
      kind: o.verdict === "reject" || o.verdict === "hold" ? "contradicts" : "supports",
      weight: Number((AGENT_BY_KEY[o.agent].weight * (o.confidence / 100)).toFixed(2)),
    });
  }

  conflicts.forEach((c, i) => {
    const id = `conflict:${i}`;
    nodes.push({ id, label: c.topic, kind: "conflict", weight: c.confidence_delta });
    for (const a of c.agents) edges.push({ from: `agent:${a}`, to: id, kind: "contradicts", weight: 1 });
    edges.push({ from: id, to: "decision:final", kind: "informs", weight: 1 });
  });

  nodes.push({
    id: "decision:final",
    label: final ? final.recommendation.replace("_", " ") : "decision",
    kind: "decision",
    weight: final?.confidence ?? 0,
  });

  return { nodes, edges };
}

/* ------------------------------------------------------------------ */
/* Graph runner                                                        */
/* ------------------------------------------------------------------ */

export async function runDebateGraph(args: {
  candidate: CandidateBrief;
  evidence: Record<string, unknown>;
  scenario?: DebateScenario;
  emit: DebateEmit;
}): Promise<GraphState> {
  const { candidate, evidence, emit } = args;
  const evidenceText = buildEvidenceText(evidence, args.scenario);

  const state: GraphState = {
    candidates: [candidate],
    evidence,
    evidenceText,
    opinions: [],
    rounds: [],
    conflicts: [],
    votes: [],
    consensus: 0,
    final: null,
    timeline: [],
  };

  const step = async <T,>(
    node: string,
    label: string,
    agent: AgentKey | null,
    fn: () => Promise<T>,
    summarise: (v: T) => string,
  ): Promise<T> => {
    const t0 = Date.now();
    emit({ type: "node", phase: "start", node, label, agent });
    const value = await fn();
    const ms = Date.now() - t0;
    const summary = summarise(value);
    state.timeline.push({ node, label, agent, ms, summary });
    emit({ type: "node", phase: "end", node, label, agent, ms, summary });
    return value;
  };

  /* evidence node ------------------------------------------------- */
  await step(
    "evidence",
    "Evidence assembly",
    null,
    async () => evidenceText,
    () =>
      `${(evidence as any).applications?.length ?? 0} applications · ${
        (evidence as any).interviews?.length ?? 0
      } interviews · ${(evidence as any).sessions?.length ?? 0} simulator sessions · twin ${
        (evidence as any).twin ? "loaded" : "missing"
      }`,
  );

  /* specialist agents — bounded parallelism ----------------------- */
  const order: AgentKey[] = [
    "technical",
    "communication",
    "leadership",
    "culture",
    "budget",
    "retention",
    "risk",
    "compliance",
    "digital_twin",
    "hiring_manager",
  ];

  for (let i = 0; i < order.length; i += 3) {
    const batch = order.slice(i, i + 3);
    for (const key of batch) {
      emit({ type: "node", phase: "start", node: key, label: `${AGENT_BY_KEY[key].short} review`, agent: key });
    }
    const results = await Promise.all(
      batch.map(async (key) => {
        try {
          return await runAgent(key, evidenceText, candidate);
        } catch (error) {
          console.error(`[debate:${key}]`, error);
          const fallback: AgentOpinion = {
            agent: key,
            candidateId: candidate.id,
            verdict: "hold",
            score: 0,
            confidence: 0,
            headline: "Agent could not complete its review.",
            reasoning: error instanceof Error ? error.message : "Model call failed.",
            arguments: [],
            evidence: [],
            concerns: ["This agent abstained; its weight was removed from the vote."],
            supporting_data: [],
            decision_path: [],
            sources_used: [],
            data_gaps: ["agent execution failed"],
            ms: 0,
          };
          return fallback;
        }
      }),
    );
    for (const opinion of results) {
      state.opinions.push(opinion);
      state.timeline.push({
        node: opinion.agent,
        label: `${AGENT_BY_KEY[opinion.agent].short} review`,
        agent: opinion.agent,
        ms: opinion.ms ?? 0,
        summary: `${opinion.verdict.replace("_", " ")} · score ${opinion.score} · confidence ${opinion.confidence}%`,
      });
      emit({ type: "opinion", opinion });
      emit({
        type: "node",
        phase: "end",
        node: opinion.agent,
        label: `${AGENT_BY_KEY[opinion.agent].short} review`,
        agent: opinion.agent,
        ms: opinion.ms ?? 0,
        summary: `${opinion.verdict.replace("_", " ")} · ${opinion.confidence}% confidence`,
      });
    }
  }

  /* cross-examination --------------------------------------------- */
  state.rounds = await step(
    "cross_examination",
    "Cross-examination",
    null,
    async () => {
      try {
        return await runCrossExamination(state.opinions, evidenceText, candidate.id);
      } catch (error) {
        console.error("[debate:cross]", error);
        return [] as DebateTurn[];
      }
    },
    (turns) => `${turns.length} exchanges · ${turns.filter((t) => t.stance === "challenge").length} challenges`,
  );
  for (const turn of state.rounds) emit({ type: "turn", turn });

  /* conflicts ------------------------------------------------------ */
  state.conflicts = await step(
    "conflicts",
    "Disagreement detection",
    null,
    async () => {
      try {
        return await detectConflicts(state.opinions, state.rounds);
      } catch (error) {
        console.error("[debate:conflicts]", error);
        return [] as Conflict[];
      }
    },
    (c) => (c.length ? `${c.length} material disagreement(s)` : "council aligned"),
  );
  emit({ type: "conflicts", conflicts: state.conflicts });

  /* voting --------------------------------------------------------- */
  const votes = await step(
    "voting",
    "Final voting",
    null,
    async () => buildVotes(state.opinions.filter((o) => o.confidence > 0), state.rounds),
    (v) => tally(v).map((t) => `${t.verdict} ${t.count}`).join(" · "),
  );
  state.votes = votes;
  state.consensus = computeConsensus(votes);
  emit({ type: "votes", votes, consensus: state.consensus });

  /* final decision -------------------------------------------------- */
  const mathVerdict = weightedVerdict(votes);
  state.final = await step(
    "decision",
    "Recommendation",
    null,
    async () =>
      runFinalAgent({
        opinions: state.opinions,
        rounds: state.rounds,
        conflicts: state.conflicts,
        votes,
        consensus: state.consensus,
        mathVerdict,
        candidate,
        evidenceText,
      }),
    (f) => `${f.recommendation.replace("_", " ")} at ${f.confidence}% confidence`,
  );
  emit({ type: "final", final: state.final, consensus: state.consensus });

  return state;
}

export const COUNCIL_MODEL = DEFAULT_MODEL;
export const COUNCIL_MODEL_VERSION = COUNCIL_VERSION;
