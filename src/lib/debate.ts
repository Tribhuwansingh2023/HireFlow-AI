/**
 * AI Recruiter Debate — client-safe contracts.
 *
 * Eleven specialised agents evaluate a candidate independently, rebut each
 * other, then a Final Decision Agent aggregates the council into one
 * auditable recommendation. This module holds the shared shapes used by both
 * the graph engine (server) and the boardroom UI (client).
 */

export const COUNCIL_VERSION = "hireflow-council-1.0";

export type Verdict = "strong_hire" | "hire" | "hold" | "reject";

export const VERDICTS: Verdict[] = ["strong_hire", "hire", "hold", "reject"];

export const VERDICT_LABEL: Record<Verdict, string> = {
  strong_hire: "Strong hire",
  hire: "Hire",
  hold: "Hold",
  reject: "Reject",
};

export const VERDICT_TONE: Record<Verdict, "success" | "info" | "warning" | "danger"> = {
  strong_hire: "success",
  hire: "info",
  hold: "warning",
  reject: "danger",
};

export type AgentKey =
  | "technical"
  | "communication"
  | "leadership"
  | "culture"
  | "budget"
  | "retention"
  | "risk"
  | "compliance"
  | "hiring_manager"
  | "digital_twin";

export type CouncilAgent = {
  key: AgentKey;
  name: string;
  short: string;
  color: string;
  accent: string;
  mandate: string;
  evaluates: string[];
  /** Relative weight in the weighted council vote. */
  weight: number;
  /** Which evidence blocks this agent is allowed to lean on. */
  sources: string[];
};

export const COUNCIL: CouncilAgent[] = [
  {
    key: "technical",
    name: "Technical Evaluation Agent",
    short: "Technical",
    color: "#3B82F6",
    accent: "59 130 246",
    mandate:
      "Judge engineering depth: programming ability, architecture, systems thinking, shipped projects, repositories and coding/system-design performance.",
    evaluates: ["Programming", "Architecture", "Projects", "GitHub", "Coding tests", "System design"],
    weight: 1.35,
    sources: ["resume", "screening", "interviews", "simulator", "github", "portfolio"],
  },
  {
    key: "communication",
    name: "Communication Agent",
    short: "Communication",
    color: "#06B6D4",
    accent: "6 182 212",
    mandate:
      "Judge clarity of thought and delivery: speaking, structure, confidence, written communication and interview presence.",
    evaluates: ["Speaking", "Confidence", "Presentation", "Interview delivery"],
    weight: 1,
    sources: ["interviews", "simulator", "emails", "resume"],
  },
  {
    key: "leadership",
    name: "Leadership Agent",
    short: "Leadership",
    color: "#8B5CF6",
    accent: "139 92 246",
    mandate:
      "Judge ownership and influence: decision making, mentoring, driving outcomes without authority, people skills.",
    evaluates: ["Ownership", "Decision making", "Mentoring", "People skills"],
    weight: 1.1,
    sources: ["resume", "interviews", "twin", "simulator"],
  },
  {
    key: "culture",
    name: "Culture Fit Agent",
    short: "Culture",
    color: "#22D3EE",
    accent: "34 211 238",
    mandate:
      "Judge team compatibility, values alignment, adaptability, remote-work suitability and working style — never demographics.",
    evaluates: ["Team compatibility", "Values", "Adaptability", "Remote work", "Work style"],
    weight: 1,
    sources: ["resume", "interviews", "twin", "team"],
  },
  {
    key: "budget",
    name: "Budget Agent",
    short: "Budget",
    color: "#F59E0B",
    accent: "245 158 11",
    mandate:
      "Judge the economics: expected salary versus market and band, total hiring cost, payback period and ROI.",
    evaluates: ["Expected salary", "Market salary", "Hiring cost", "ROI"],
    weight: 0.95,
    sources: ["job", "offers", "twin", "benchmarks"],
  },
  {
    key: "retention",
    name: "Retention Risk Agent",
    short: "Retention",
    color: "#10B981",
    accent: "16 185 129",
    mandate:
      "Judge staying power: burnout exposure, tenure pattern, job stability and whether the role feeds their growth.",
    evaluates: ["Burnout", "Retention", "Job stability", "Career growth"],
    weight: 1,
    sources: ["resume", "twin", "interviews"],
  },
  {
    key: "risk",
    name: "Risk Analysis Agent",
    short: "Risk",
    color: "#EF4444",
    accent: "239 68 68",
    mandate:
      "Judge integrity of the evidence: résumé inflation, unexplained gaps, unverifiable claims, certificate authenticity.",
    evaluates: ["Fake resume risk", "Employment gaps", "Skill inflation", "Certification authenticity"],
    weight: 1.15,
    sources: ["resume", "screening", "twin", "github"],
  },
  {
    key: "compliance",
    name: "Compliance Agent",
    short: "Compliance",
    color: "#A78BFA",
    accent: "167 139 250",
    mandate:
      "Judge policy conformance: mandatory experience, required certifications, location/work-authorisation signals stated in the job, and fair-hiring rules.",
    evaluates: ["Hiring policies", "Required certifications", "Experience requirements", "Background compliance"],
    weight: 0.9,
    sources: ["job", "resume", "screening"],
  },
  {
    key: "hiring_manager",
    name: "Hiring Manager Agent",
    short: "Hiring manager",
    color: "#F472B6",
    accent: "244 114 182",
    mandate:
      "Judge business impact: what this person unlocks in 6-24 months, strategic fit against the roadmap and the opportunity cost of passing.",
    evaluates: ["Business impact", "Long-term value", "Strategic fit"],
    weight: 1.25,
    sources: ["job", "resume", "twin", "benchmarks", "interviews"],
  },
  {
    key: "digital_twin",
    name: "Digital Twin Agent",
    short: "Digital Twin",
    color: "#818CF8",
    accent: "129 140 248",
    mandate:
      "Speak strictly from the persisted Digital Twin forecast: promotion probability, learning speed, future potential and growth trajectory.",
    evaluates: ["Promotion", "Learning speed", "Future potential", "Growth"],
    weight: 1.05,
    sources: ["twin"],
  },
];

export const AGENT_BY_KEY: Record<AgentKey, CouncilAgent> = Object.fromEntries(
  COUNCIL.map((a) => [a.key, a]),
) as Record<AgentKey, CouncilAgent>;

/** Ordered graph nodes — mirrors the server-side execution graph. */
export const GRAPH_NODES = [
  { id: "evidence", label: "Evidence assembly", agent: null as AgentKey | null },
  { id: "technical", label: "Technical review", agent: "technical" as AgentKey | null },
  { id: "communication", label: "Communication review", agent: "communication" as AgentKey | null },
  { id: "leadership", label: "Leadership review", agent: "leadership" as AgentKey | null },
  { id: "culture", label: "Culture review", agent: "culture" as AgentKey | null },
  { id: "budget", label: "Budget review", agent: "budget" as AgentKey | null },
  { id: "retention", label: "Retention review", agent: "retention" as AgentKey | null },
  { id: "risk", label: "Risk review", agent: "risk" as AgentKey | null },
  { id: "compliance", label: "Compliance review", agent: "compliance" as AgentKey | null },
  { id: "digital_twin", label: "Digital Twin review", agent: "digital_twin" as AgentKey | null },
  { id: "hiring_manager", label: "Hiring manager review", agent: "hiring_manager" as AgentKey | null },
  { id: "cross_examination", label: "Cross-examination", agent: null as AgentKey | null },
  { id: "conflicts", label: "Disagreement detection", agent: null as AgentKey | null },
  { id: "voting", label: "Final voting", agent: null as AgentKey | null },
  { id: "decision", label: "Recommendation", agent: null as AgentKey | null },
] as const;

export type EvidenceRef = {
  source: string;
  label: string;
  detail?: string;
};

export type AgentOpinion = {
  agent: AgentKey;
  candidateId: string;
  verdict: Verdict;
  score: number;
  confidence: number;
  headline: string;
  reasoning: string;
  arguments: string[];
  evidence: EvidenceRef[];
  concerns: string[];
  supporting_data: Array<{ label: string; value: string }>;
  decision_path: string[];
  sources_used: string[];
  data_gaps: string[];
  ms?: number;
};

export type DebateTurn = {
  round: number;
  agent: AgentKey;
  target?: AgentKey | null;
  stance: "support" | "challenge" | "concede" | "clarify";
  candidateId?: string | null;
  message: string;
  evidence: EvidenceRef[];
  confidence: number;
  /** Confidence the agent moved to after the exchange, when it updated. */
  revised_confidence?: number | null;
  revised_verdict?: Verdict | null;
};

export type Conflict = {
  topic: string;
  agents: AgentKey[];
  positions: Array<{ agent: AgentKey; position: string }>;
  conflicting_evidence: string[];
  confidence_delta: number;
  severity: "low" | "medium" | "high";
  resolution: string;
  resolved_by?: AgentKey | null;
};

export type CouncilVote = {
  agent: AgentKey;
  candidateId: string;
  verdict: Verdict;
  confidence: number;
  weight: number;
  note: string;
};

export type FinalDecision = {
  candidateId: string;
  recommendation: Verdict;
  confidence: number;
  consensus: number;
  summary: string;
  reasons: string[];
  evidence: EvidenceRef[];
  business_impact: string;
  risk_analysis: string;
  expected_roi: string;
  promotion_probability: number;
  retention_prediction: number;
  dissent: string[];
  conditions: string[];
  next_actions: string[];
  decision_path: string[];
};

export type ReasoningGraph = {
  nodes: Array<{ id: string; label: string; kind: "evidence" | "agent" | "conflict" | "decision"; weight: number }>;
  edges: Array<{ from: string; to: string; kind: "supports" | "contradicts" | "informs"; weight: number }>;
};

export type DebateRecord = {
  id: string;
  title: string;
  job_id: string | null;
  job_version: number | null;
  candidate_ids: string[];
  application_ids: string[];
  mode: string;
  scenario: DebateScenario;
  status: string;
  model: string | null;
  model_version: string;
  candidates: Array<{ id: string; name: string; headline: string | null; score: number | null }>;
  evidence: Record<string, unknown>;
  opinions: AgentOpinion[];
  rounds: DebateTurn[];
  votes: CouncilVote[];
  conflicts: Conflict[];
  graph: ReasoningGraph;
  timeline: Array<{ node: string; label: string; agent: AgentKey | null; ms: number; summary: string }>;
  final: FinalDecision;
  consensus: number;
  confidence: number;
  recommendation: Verdict | null;
  is_simulation: boolean;
  parent_debate_id: string | null;
  human_decision: string | null;
  human_comment: string | null;
  human_override: boolean;
  decided_by: string | null;
  decided_at: string | null;
  latency_ms: number;
  created_by: string | null;
  created_at: string;
};

export type DebateScenario = {
  extra_experience?: number;
  add_certification?: string;
  interview_boost?: number;
  salary_delta?: number;
  remote?: boolean;
  note?: string;
};

export const SCENARIO_FIELDS = [
  { key: "extra_experience", label: "Additional experience", unit: "yrs", min: 0, max: 8, step: 0.5 },
  { key: "interview_boost", label: "Interview score lift", unit: "pts", min: -20, max: 30, step: 1 },
  { key: "salary_delta", label: "Salary expectation change", unit: "%", min: -40, max: 40, step: 1 },
] as const;

export const SUGGESTED_QUESTIONS = [
  "Why did the Technical Agent land on that verdict?",
  "Why did the Budget Agent disagree?",
  "Show the evidence the Risk Agent used.",
  "Compare every agent opinion side by side.",
  "Why is the council confidence not higher?",
  "What single piece of missing evidence would change the decision?",
];

export function verdictScore(v: Verdict): number {
  return v === "strong_hire" ? 100 : v === "hire" ? 75 : v === "hold" ? 45 : 10;
}

/** Weighted council consensus: 100 = unanimous, 0 = maximally split. */
export function computeConsensus(votes: CouncilVote[]): number {
  if (votes.length === 0) return 0;
  const totalWeight = votes.reduce((s, v) => s + v.weight, 0) || 1;
  const mean = votes.reduce((s, v) => s + verdictScore(v.verdict) * v.weight, 0) / totalWeight;
  const variance = votes.reduce((s, v) => s + v.weight * (verdictScore(v.verdict) - mean) ** 2, 0) / totalWeight;
  const spread = Math.sqrt(variance); // 0..~45
  return Math.max(0, Math.min(100, Math.round(100 - (spread / 45) * 100)));
}

export function weightedVerdict(votes: CouncilVote[]): Verdict {
  if (votes.length === 0) return "hold";
  const totalWeight = votes.reduce((s, v) => s + v.weight * (v.confidence / 100), 0) || 1;
  const mean =
    votes.reduce((s, v) => s + verdictScore(v.verdict) * v.weight * (v.confidence / 100), 0) / totalWeight;
  if (mean >= 88) return "strong_hire";
  if (mean >= 65) return "hire";
  if (mean >= 35) return "hold";
  return "reject";
}

export function tally(votes: CouncilVote[]): Array<{ verdict: Verdict; count: number; weight: number }> {
  return VERDICTS.map((verdict) => {
    const rows = votes.filter((v) => v.verdict === verdict);
    return {
      verdict,
      count: rows.length,
      weight: Number(rows.reduce((s, v) => s + v.weight, 0).toFixed(2)),
    };
  });
}
