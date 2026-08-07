/**
 * AI Hiring Digital Twin — shared constants and types (client-safe).
 */
export const TWIN_MODEL_VERSION = "hireflow-twin-1.2";

export const DNA_DIMENSIONS = [
  "Technical Skill",
  "Communication",
  "Leadership",
  "Problem Solving",
  "Learning Ability",
  "Adaptability",
  "Teamwork",
  "Ownership",
  "Decision Making",
  "Innovation",
] as const;

export const PREDICTION_KEYS = [
  "Learning Ability",
  "Adaptability",
  "Leadership Potential",
  "Promotion Probability",
  "Retention Probability",
  "Burnout Risk",
  "Salary Satisfaction",
  "Culture Fit",
  "Remote Work Suitability",
  "Management Readiness",
  "Innovation Potential",
  "Upskilling Speed",
  "Career Growth Trajectory",
  "Job Stability",
  "Long-Term Value",
] as const;

export type TwinScenario = {
  years_experience?: number;
  communication?: number;
  leadership?: number;
  technical?: number;
  education_level?: number;
  certifications?: number;
};

export type TwinPayload = {
  dna: Array<{ dimension: string; score: number; confidence: number; rationale: string; evidence: string[] }>;
  predictions: Array<{
    key: string;
    value: number;
    confidence: number;
    reasoning: string;
    evidence: string[];
    features: Array<{ name: string; weight: number; direction: "positive" | "negative" }>;
    decision_path: string[];
  }>;
  promotion_path: Array<{ role: string; eta_years: number; probability: number; rationale: string }>;
  trajectory: Array<{ stage: string; label: string; period: string; explanation: string }>;
  skill_evolution: Array<{ skill: string; now: number; projected: number; horizon_months: number; rationale: string }>;
  retention: {
    six_months: number;
    one_year: number;
    two_years: number;
    drivers: Array<{ factor: string; impact: number; note: string }>;
  };
  burnout: {
    risk: number;
    mental_workload: number;
    context_switching: number;
    stress: number;
    level: "low" | "moderate" | "elevated" | "high";
    recovery: string[];
  };
  team_chemistry: {
    best_match: string;
    compatibility: number;
    reasons: Array<{ factor: string; score: number; note: string }>;
  };
  salary: {
    market_value: number;
    expected: number;
    budget: number;
    currency: string;
    satisfaction: number;
    negotiation_difficulty: "low" | "medium" | "high";
    acceptance_probability: number;
    note: string;
  };
  risk: Array<{ factor: string; score: number; level: "low" | "medium" | "high"; note: string }>;
  recruiter_summary: string;
  overall_confidence: number;
  reliability: "low" | "medium" | "high";
};
