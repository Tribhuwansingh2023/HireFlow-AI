/**
 * AI Interview Simulator — shared constants and types (client-safe).
 */

export const INTERVIEW_MODEL_VERSION = "hireflow-interview-1.0";

export const ROUND_TYPES = ["technical", "system_design", "behavioral", "coding", "mixed"] as const;
export type RoundType = (typeof ROUND_TYPES)[number];

export const ROUND_LABEL: Record<RoundType, string> = {
  technical: "Technical deep dive",
  system_design: "System design",
  behavioral: "Behavioral / STAR",
  coding: "Live coding",
  mixed: "Mixed panel",
};

export const DIFFICULTIES = ["warmup", "standard", "hard", "principal"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const COMPANY_TYPES = ["product", "startup", "enterprise", "consulting", "research"] as const;

/** Continuously updated interview scorecard. */
export const SCORE_KEYS = [
  "Technical Knowledge",
  "Communication",
  "Confidence",
  "Leadership",
  "Problem Solving",
  "Critical Thinking",
  "Adaptability",
  "Creativity",
  "Professionalism",
  "Culture Fit",
] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

export const VOICE_KEYS = [
  "Confidence",
  "Speech Clarity",
  "Pronunciation",
  "Fluency",
  "Speaking Speed",
  "Fillers",
  "Pauses",
  "Hesitation",
  "Vocabulary",
  "Grammar",
  "Energy",
  "Professional Tone",
] as const;

export const FACE_KEYS = [
  "Eye Contact",
  "Attention",
  "Smile",
  "Stress Level",
  "Confidence",
  "Head Movement",
  "Engagement",
  "Looking Away",
  "Distraction",
  "Professionalism",
] as const;

export const BODY_KEYS = [
  "Posture",
  "Hand Movement",
  "Body Stability",
  "Nervousness",
  "Confidence",
  "Movement",
] as const;

export const EMOTION_KEYS = [
  "happy",
  "confident",
  "neutral",
  "stressed",
  "confused",
  "excited",
  "anxious",
  "frustrated",
] as const;
export type EmotionKey = (typeof EMOTION_KEYS)[number];

/** Higher value = worse, so charts and tones invert these. */
export const NEGATIVE_METRICS = new Set<string>([
  "Fillers",
  "Pauses",
  "Hesitation",
  "Stress Level",
  "Looking Away",
  "Distraction",
  "Nervousness",
  "Head Movement",
  "Movement",
]);

export const RECOMMENDATIONS = ["strong_hire", "hire", "hold", "reject"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  strong_hire: "Strong hire",
  hire: "Hire",
  hold: "Hold",
  reject: "Reject",
};

export type ScoreEntry = {
  key: string;
  value: number;
  confidence: number;
  reason: string;
  evidence: string[];
  transcript_support: string;
  resume_support: string;
};

export type TurnEvaluation = {
  correctness: number;
  depth: number;
  logical_thinking: number;
  problem_solving: number;
  system_design: number;
  coding_knowledge: number;
  project_understanding: number;
  architecture: number;
  real_world_thinking: number;
  reasoning: string;
  strengths: string[];
  gaps: string[];
  keywords: Array<{ term: string; kind: "technical" | "confidence" | "issue" | "highlight" }>;
  consistency: { score: number; note: string; flags: string[] };
};

export type NextQuestion = {
  question: string;
  competency: string;
  rationale: string;
  is_follow_up: boolean;
  expected_signals: string[];
  kind: "question" | "coding" | "system_design" | "behavioral";
  starter_code?: string;
  test_cases?: Array<{ input: string; expected: string }>;
};

export type AnswerResult = {
  evaluation: TurnEvaluation;
  live_feedback: string[];
  scores: ScoreEntry[];
  overall: number;
  next: NextQuestion | null;
  finished: boolean;
};

export type SessionSummary = {
  strengths: string[];
  weaknesses: string[];
  technical_level: string;
  communication: string;
  leadership: string;
  risk_factors: string[];
  training_needs: string[];
  salary_range: { min: number; max: number; currency: string; note: string };
  executive_summary: string;
  hiring_recommendation: {
    decision: Recommendation;
    confidence: number;
    why: string;
    evidence: string[];
    transcript_support: string[];
    resume_support: string[];
  };
};

export type CoachReport = {
  items: Array<{ area: string; advice: string; drill: string; improvement_weeks: number }>;
  summary: string;
};

export type HeatmapPoint = {
  turn_index: number;
  label: string;
  kind: "excelled" | "struggled" | "nervous" | "exceptional";
  score: number;
  note: string;
};

export const clampScore = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

/** Naive on-device speech metrics used to ground the model's voice analysis. */
export function speechStats(transcript: string, seconds: number) {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  const fillers = (transcript.toLowerCase().match(/\b(um+|uh+|like|you know|basically|actually|i mean|sort of|kind of)\b/g) ?? []).length;
  const wpm = seconds > 0 ? Math.round((words.length / seconds) * 60) : 0;
  const sentences = transcript.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
  const unique = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z0-9']/g, ""))).size;
  return {
    words: words.length,
    seconds,
    wpm,
    fillers,
    filler_rate: words.length ? Math.round((fillers / words.length) * 1000) / 10 : 0,
    sentences,
    avg_sentence_words: sentences ? Math.round(words.length / sentences) : words.length,
    lexical_diversity: words.length ? Math.round((unique / words.length) * 100) : 0,
  };
}
