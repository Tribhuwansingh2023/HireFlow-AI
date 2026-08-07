/**
 * RecruitGPT — shared, client-safe types and constants for the AI Hiring Copilot.
 */

export const RECRUITGPT_VERSION = "recruitgpt-1.0";

export type AgentKey =
  | "resume"
  | "ranking"
  | "interview"
  | "scheduling"
  | "email"
  | "analytics"
  | "twin"
  | "risk"
  | "workflow";

export const AGENTS: Record<AgentKey, { label: string; blurb: string; color: string }> = {
  resume: { label: "Resume Agent", blurb: "Parses and searches resume evidence", color: "text-twin-cyan" },
  ranking: { label: "Ranking Agent", blurb: "Scores and orders candidates", color: "text-primary" },
  interview: { label: "Interview Agent", blurb: "Builds and evaluates interviews", color: "text-twin-violet" },
  scheduling: { label: "Scheduling Agent", blurb: "Books rounds and meeting links", color: "text-accent" },
  email: { label: "Email Agent", blurb: "Drafts candidate communication", color: "text-warning" },
  analytics: { label: "Analytics Agent", blurb: "Funnel, cost and quality metrics", color: "text-success" },
  twin: { label: "Digital Twin Agent", blurb: "Predicts future performance", color: "text-twin-blue" },
  risk: { label: "Risk Analysis Agent", blurb: "Flags fraud, inflation and attrition", color: "text-destructive" },
  workflow: { label: "Workflow Agent", blurb: "Chains multi-step automations", color: "text-muted-foreground" },
};

/** Structured payloads the copilot can attach to an answer for rich rendering. */
export type CopilotCard =
  | { type: "candidates"; title: string; rows: CandidateRow[] }
  | { type: "ranking"; title: string; job: string; rows: CandidateRow[] }
  | { type: "comparison"; title: string; metrics: string[]; candidates: ComparisonColumn[]; winner: string; reason: string }
  | { type: "twin"; title: string; candidate: string; dna: Array<{ label: string; value: number }>; predictions: Array<{ label: string; value: number; hint?: string; invert?: boolean }> }
  | { type: "debate"; title: string; positions: Array<{ agent: string; stance: string; argument: string; score: number }>; verdict: string; confidence: number }
  | { type: "simulation"; title: string; candidate: string; scenario: string; deltas: Array<{ label: string; before: number; after: number }> }
  | { type: "report"; title: string; reportId: string; sections: Array<{ heading: string; body: string; bullets?: string[] }> }
  | { type: "metrics"; title: string; stats: Array<{ label: string; value: string; hint?: string }> }
  | { type: "action"; title: string; status: "done" | "draft"; detail: string; link?: string }
  | { type: "questions"; title: string; items: Array<{ question: string; competency?: string; why?: string; signal?: string }> };

export type CandidateRow = {
  id: string;
  name: string;
  headline?: string | null;
  score?: number | null;
  years?: number | null;
  location?: string | null;
  matched?: string[];
  missing?: string[];
  reason?: string;
};

export type ComparisonColumn = {
  name: string;
  candidateId?: string | null;
  values: Record<string, string>;
};

export type ToolTrace = {
  agent: AgentKey;
  tool: string;
  label: string;
  input: unknown;
  summary: string;
  ms: number;
  ok: boolean;
};

export type CopilotAnswer = {
  content: string;
  reasoning: { summary: string; steps: string[] };
  evidence: string[];
  decisionPath: string[];
  supportingData: Record<string, unknown>;
  followUps: string[];
  confidence: number;
  cards: CopilotCard[];
  traces: ToolTrace[];
  model: string;
  modelVersion: string;
  latencyMs: number;
};

export const EXAMPLE_PROMPTS: Array<{ text: string; group: string }> = [
  { text: "Find the best Python developer in my talent pool", group: "Search" },
  { text: "Rank candidates for Backend Engineer and explain the order", group: "Ranking" },
  { text: "Find candidates with Kubernetes and AWS", group: "Search" },
  { text: "Search resumes mentioning TensorFlow", group: "Search" },
  { text: "Find candidates with leadership experience", group: "Search" },
  { text: "Compare my top two candidates side by side", group: "Compare" },
  { text: "Who should I hire? Run the hiring debate", group: "Decide" },
  { text: "Predict who will stay longer", group: "Predict" },
  { text: "Show the Digital Twin for my strongest candidate", group: "Predict" },
  { text: "Generate interview questions for the top candidate", group: "Interview" },
  { text: "Schedule interviews for the top candidates next Tuesday at 10am", group: "Automate" },
  { text: "Draft a rejection email for the lowest scoring candidate", group: "Automate" },
  { text: "Generate a hiring report for leadership", group: "Report" },
  { text: "Where is my pipeline leaking and what should I fix first?", group: "Analytics" },
];

export const FOLLOW_UP_DEFAULTS = [
  "Compare the top candidates",
  "Generate interview questions",
  "Schedule an interview",
  "View the Digital Twin",
  "Export an executive report",
];

export const QUICK_ACTIONS: Array<{ label: string; prompt: string }> = [
  { label: "Rank a role", prompt: "Rank candidates for " },
  { label: "Compare candidates", prompt: "Compare " },
  { label: "Hiring debate", prompt: "Who should I hire for " },
  { label: "Executive report", prompt: "Generate a hiring report for " },
  { label: "Pipeline health", prompt: "How healthy is my pipeline right now?" },
  { label: "Bottlenecks", prompt: "What are my recruitment bottlenecks?" },
];

export type StreamEvent =
  | { type: "thread"; threadId: string; title: string }
  | { type: "status"; label: string }
  | { type: "tool"; phase: "start" | "end"; trace: Partial<ToolTrace> & { tool: string; agent: AgentKey; label: string } }
  | { type: "card"; card: CopilotCard }
  | { type: "delta"; text: string }
  | { type: "final"; answer: CopilotAnswer; turnId: string }
  | { type: "error"; message: string };
