/**
 * Reusable email templates with {{variable}} placeholders.
 * Rendering is deterministic and shared by the template editor and the email queue.
 */

export const TEMPLATE_VARIABLES = [
  { key: "candidate_name", label: "Candidate name" },
  { key: "candidate_first_name", label: "Candidate first name" },
  { key: "job_title", label: "Job title" },
  { key: "department", label: "Department" },
  { key: "location", label: "Location" },
  { key: "stage", label: "Current stage" },
  { key: "match_score", label: "Match score" },
  { key: "interview_round", label: "Interview round" },
  { key: "interview_date", label: "Interview date/time" },
  { key: "meeting_link", label: "Meeting link" },
  { key: "salary", label: "Offer salary" },
  { key: "start_date", label: "Start date" },
  { key: "recruiter_name", label: "Recruiter name" },
  { key: "company", label: "Company" },
] as const;

export type TemplateVars = Record<string, string>;

const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Replaces every {{token}} with its value; unknown tokens are left visibly unresolved. */
export function renderTemplate(text: string, vars: TemplateVars): string {
  return String(text ?? "").replace(TOKEN, (_m, key: string) => {
    const value = vars[key];
    return value != null && value !== "" ? value : `[${key}]`;
  });
}

/** Every distinct placeholder used in a template body/subject. */
export function usedVariables(...parts: string[]): string[] {
  const found = new Set<string>();
  for (const part of parts) {
    for (const m of String(part ?? "").matchAll(TOKEN)) found.add(m[1]!);
  }
  return [...found];
}

/** Placeholders that will not resolve with the supplied values. */
export function unresolvedVariables(vars: TemplateVars, ...parts: string[]): string[] {
  return usedVariables(...parts).filter((k) => !vars[k]);
}

export const EMAIL_KINDS: Array<[string, string]> = [
  ["interview_invite", "Interview invite"],
  ["rejection", "Rejection"],
  ["offer", "Offer"],
  ["update", "Status update"],
  ["reference_request", "Reference request"],
];

/** Builds the variable bag for an application-linked email. */
export function varsForApplication(app: any, extra: TemplateVars = {}): TemplateVars {
  const cand = app?.candidate ?? {};
  const job = app?.job ?? {};
  const name = String(cand.full_name ?? "");
  return {
    candidate_name: name,
    candidate_first_name: name.split(" ")[0] ?? name,
    job_title: String(job.title ?? ""),
    department: String(job.department ?? ""),
    location: String(job.location ?? ""),
    stage: String(app?.stage ?? ""),
    match_score: app?.match_score != null ? `${app.match_score}/100` : "",
    company: "HireFlow",
    ...extra,
  };
}
