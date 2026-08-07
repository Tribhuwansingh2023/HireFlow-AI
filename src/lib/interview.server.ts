/**
 * AI Interview Simulator — server-only prompt construction and multimodal calls.
 */
import { AiGatewayError, DEFAULT_MODEL, parseLooseJson } from "./ai-gateway.server";
import {
  BODY_KEYS,
  EMOTION_KEYS,
  FACE_KEYS,
  ROUND_LABEL,
  SCORE_KEYS,
  VOICE_KEYS,
  type RoundType,
} from "./interview";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

function apiKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new AiGatewayError(500, "AI is not configured (missing gateway key).");
  return key;
}

function friendly(status: number, body: string): string {
  if (status === 429) return "AI rate limit reached. Please retry in a few seconds.";
  if (status === 402) return "AI credits exhausted. Add credits to continue using AI features.";
  return `AI request failed (${status}): ${body.slice(0, 300)}`;
}

/** Multimodal chat call (text + optional image frames) that must return JSON. */
export async function visionJson<T>(
  system: string,
  text: string,
  images: string[],
): Promise<T> {
  const content: any[] = [{ type: "text", text }];
  for (const url of images) content.push({ type: "image_url", image_url: { url } });

  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey() },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[interview:vision] ${res.status} ${body}`);
    throw new AiGatewayError(res.status, friendly(res.status, body));
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return parseLooseJson<T>(data.choices?.[0]?.message?.content ?? "");
}

/** Speech-to-text for a recorded answer. Expects a complete WAV file. */
export async function transcribeWav(bytes: Uint8Array): Promise<string> {
  const form = new FormData();
  form.append("model", "openai/gpt-4o-mini-transcribe");
  form.append("file", new Blob([bytes as unknown as BlobPart], { type: "audio/wav" }), "answer.wav");

  const res = await fetch(`${GATEWAY}/audio/transcriptions`, {
    method: "POST",
    headers: { "Lovable-API-Key": apiKey() },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[interview:stt] ${res.status} ${body}`);
    throw new AiGatewayError(res.status, friendly(res.status, body));
  }
  const data = (await res.json()) as { text?: string };
  return data.text ?? "";
}

export const INTERVIEWER_SYSTEM = `You are HireFlow's AI Interviewer — a senior engineer and hiring panellist.
You run adaptive, evidence-driven interviews.

RULES
- NEVER ask a generic or reusable question. Every question must reference something concrete from the job description, the resume, a named project, a listed skill, or something the candidate just said.
- Adapt: if the previous answer was strong, go deeper or raise difficulty; if it was weak or vague, probe the gap or step back one level.
- Prefer a follow-up on the candidate's own words when they mention a specific technology, trade-off or metric.
- Ask exactly ONE question at a time, spoken in natural interviewer language, under 60 words.
- Never reference protected attributes (name origin, gender, age, nationality, marital status, photo, university prestige).
- Return ONLY JSON.`;

export const EVALUATOR_SYSTEM = `You are HireFlow's AI Interview Assessor — a calibrated evaluation model combining a senior engineer, a communication coach and an I/O psychologist.

RULES
- Score 0-100 integers, calibrated and honest. Sparse or short answers get LOW confidence, not automatically low scores.
- Ground every judgement in the transcript, the measured speech statistics, the observed facial/body signals and the resume. Quote short excerpts as evidence.
- Consistency: compare spoken claims against the resume. Report a consistency score (100 = fully consistent). Describe discrepancies factually — never accuse the candidate of lying.
- Never reference protected attributes.
- Return ONLY JSON.`;

export const VISION_SYSTEM = `You are HireFlow's multimodal interview observer. You receive webcam frames captured during a live interview answer.
Assess only what is visible: gaze direction, attention, expression, posture, hand movement, stability and visible tension.
Return calibrated 0-100 integers with an honest confidence. If a frame is dark, blurred or has no visible person, say so, lower confidence and return neutral values.
Never infer or mention age, gender, ethnicity, attractiveness, health or any protected attribute. Return ONLY JSON.`;

export function contextBlock(ctx: any): string {
  const job = ctx.job ?? {};
  const c = ctx.candidate ?? {};
  const app = ctx.application ?? {};
  return `ROLE
Title: ${job.title ?? "n/a"} (${job.seniority ?? "level n/a"}, ${job.department ?? "dept n/a"})
Job description: ${String(job.description ?? "").slice(0, 3000)}
Required skills: ${(job.required_skills ?? []).join(", ") || "n/a"}
Nice to have: ${(job.nice_to_have_skills ?? []).join(", ") || "n/a"}
Minimum experience: ${job.min_experience_years ?? 0} years
Job description version pinned for this interview: v${ctx.jobVersion ?? job.current_version ?? 1}

CANDIDATE
Name: ${c.full_name ?? "candidate"}
Headline: ${c.headline ?? "n/a"}
Experience: ${c.years_experience ?? 0} years
Skills: ${(c.skills ?? []).join(", ") || "n/a"}
Projects / work history: ${JSON.stringify(c.work_history ?? []).slice(0, 2500)}
Education: ${JSON.stringify(c.education ?? []).slice(0, 800)}
Resume excerpt: ${String(c.resume_text ?? "").slice(0, 5000)}

SCREENING RESULT
Match score: ${app.match_score ?? "n/a"}/100 · recommendation ${app.ai_recommendation ?? "n/a"}
Matched skills: ${(app.matched_skills ?? []).join(", ") || "none"}
Missing skills: ${(app.missing_skills ?? []).join(", ") || "none"}
Screening summary: ${String(app.ai_summary ?? "").slice(0, 900)}

INTERVIEW SETUP
Round ${ctx.session?.round_number ?? 1} · ${ROUND_LABEL[(ctx.session?.round_type ?? "technical") as RoundType]} · difficulty ${ctx.session?.difficulty ?? "standard"} · ${ctx.session?.company_type ?? "product"} company
Planned questions: ${ctx.session?.planned_questions ?? 6}

PREVIOUS ROUNDS IN THIS PIPELINE
${
  (ctx.priorInterviews ?? []).length
    ? (ctx.priorInterviews ?? [])
        .map(
          (i: any) =>
            `- Round ${i.round_number} ${i.round_name}: rating ${i.feedback_rating ?? "n/a"}/5 · ${String(i.feedback_summary ?? i.feedback_notes ?? "no notes").slice(0, 300)}`,
        )
        .join("\n")
    : "- none"
}`;
}

export function transcriptBlock(turns: any[]): string {
  if (!turns.length) return "No questions asked yet — this is the opening question.";
  return turns
    .map(
      (t: any) =>
        `Q${t.turn_index + 1}${t.is_follow_up ? " (follow-up)" : ""} [${t.competency ?? "general"}]: ${t.question}
A: ${t.answer_transcript ? String(t.answer_transcript).slice(0, 1600) : "(not answered yet)"}
${t.evaluation?.reasoning ? `Assessor: ${String(t.evaluation.reasoning).slice(0, 500)}` : ""}`,
    )
    .join("\n\n");
}

export function nextQuestionPrompt(ctx: any, turns: any[], asked: number): string {
  const s = ctx.session ?? {};
  return `${contextBlock(ctx)}

INTERVIEW SO FAR
${transcriptBlock(turns)}

You have asked ${asked} of ${s.planned_questions ?? 6} planned questions.
Produce the NEXT question. ${asked === 0 ? "This is the opener: make it specific to this candidate's strongest relevant project or skill for this role." : "Decide between a deeper follow-up on the last answer or a new competency the round still needs to cover."}
${s.round_type === "coding" ? "This is a live coding round: pose a runnable coding problem, include starter code and 3 test cases." : ""}
${s.round_type === "system_design" ? "This is a system design round: pose an architecture problem sized to the candidate's seniority, and expect scalability, database, caching, microservices, security, monitoring and trade-off discussion." : ""}
${s.round_type === "behavioral" ? "This is a behavioral round: pose a STAR question targeting leadership, conflict resolution, ownership, decision making, time management or growth mindset." : ""}

Return ONLY JSON:
{"question":"...","competency":"short competency name","rationale":"why this question, referencing the evidence that prompted it","is_follow_up":true|false,"expected_signals":["3-4 things a strong answer demonstrates"],"kind":"question"|"coding"|"system_design"|"behavioral"${s.round_type === "coding" ? ',"starter_code":"...","test_cases":[{"input":"...","expected":"..."}]' : ""}}`;
}

export function evaluationPrompt(
  ctx: any,
  turns: any[],
  current: any,
  transcript: string,
  stats: any,
  observed: any,
  code: string | undefined,
): string {
  return `${contextBlock(ctx)}

INTERVIEW SO FAR
${transcriptBlock(turns)}

CURRENT QUESTION [${current.competency ?? "general"}]: ${current.question}
Expected signals: ${JSON.stringify(current.expected_signals ?? [])}

CANDIDATE ANSWER (verbatim transcript)
"""${transcript.slice(0, 6000)}"""
${code ? `\nCODE SUBMISSION\n\`\`\`\n${code.slice(0, 4000)}\n\`\`\`\nEvaluate complexity, correctness, readability, optimisation, naming and architecture.` : ""}

MEASURED SPEECH STATISTICS (computed on-device from the recording, not estimated)
${JSON.stringify(stats)}

OBSERVED MULTIMODAL SIGNALS (aggregated from webcam frames analysed during this answer)
${JSON.stringify(observed ?? {})}

Produce a full assessment. Return ONLY JSON:
{
 "evaluation":{"correctness":0-100,"depth":0-100,"logical_thinking":0-100,"problem_solving":0-100,"system_design":0-100,"coding_knowledge":0-100,"project_understanding":0-100,"architecture":0-100,"real_world_thinking":0-100,
   "reasoning":"3-4 sentences citing the transcript",
   "strengths":["..."],"gaps":["..."],
   "keywords":[{"term":"exact phrase from the transcript","kind":"technical"|"confidence"|"issue"|"highlight"}],
   "consistency":{"score":0-100,"note":"how spoken claims line up with the resume","flags":["specific discrepancy or []"]}},
 "voice":{${VOICE_KEYS.map((k) => `"${k}":0-100`).join(",")}},
 "live_feedback":["2-4 SHORT coaching chips shown live, e.g. 'Speaking too fast', 'Great technical answer', 'Reduce fillers'"],
 "scores":[{"key":one of ${JSON.stringify(SCORE_KEYS)},"value":0-100,"confidence":0-100,"reason":"1-2 sentences","evidence":["2-3 concrete observations"],"transcript_support":"short quote","resume_support":"resume fact or 'not applicable'"}] (all 10, cumulative for the interview so far),
 "overall":0-100
}`;
}

export function visionPrompt(round: string): string {
  return `Analyse these webcam frames from a live ${round} interview answer. Return ONLY JSON:
{"face":{${FACE_KEYS.map((k) => `"${k}":0-100`).join(",")}},
 "body":{${BODY_KEYS.map((k) => `"${k}":0-100`).join(",")}},
 "emotion":{${EMOTION_KEYS.map((k) => `"${k}":0-100`).join(",")}},
 "confidence":0-100,
 "notes":"one sentence describing what is visible, or why the reading is unreliable"}
Remember: "Stress Level", "Looking Away", "Distraction", "Nervousness", "Head Movement" and "Movement" are RISK metrics — higher means more of that behaviour.`;
}

export function summaryPrompt(ctx: any, turns: any[], signals: any, scores: any[]): string {
  return `${contextBlock(ctx)}

FULL INTERVIEW TRANSCRIPT AND ASSESSMENTS
${transcriptBlock(turns)}

PER-TURN EVALUATIONS
${turns.map((t: any) => `Q${t.turn_index + 1}: ${JSON.stringify(t.evaluation ?? {}).slice(0, 1200)}`).join("\n")}

AGGREGATED MULTIMODAL SIGNALS ACROSS THE INTERVIEW
${JSON.stringify(signals).slice(0, 2500)}

CUMULATIVE SCORECARD
${JSON.stringify(scores).slice(0, 2500)}

Write the executive interview report. Salary range must be grounded in the role's posted band (${ctx.job?.salary_min ?? "n/a"}–${ctx.job?.salary_max ?? "n/a"}) and the demonstrated level.

Return ONLY JSON:
{
 "summary":{"strengths":["..."],"weaknesses":["..."],"technical_level":"e.g. Strong mid-level, approaching senior","communication":"1-2 sentences","leadership":"1-2 sentences","risk_factors":["..."],"training_needs":["..."],
   "salary_range":{"min":number,"max":number,"currency":"USD","note":"..."},
   "executive_summary":"6-8 sentences for the hiring manager",
   "hiring_recommendation":{"decision":"strong_hire"|"hire"|"hold"|"reject","confidence":0-100,"why":"...","evidence":["..."],"transcript_support":["short quotes"],"resume_support":["resume facts"]}},
 "coach":{"summary":"...","items":[{"area":"...","advice":"...","drill":"concrete practice task","improvement_weeks":number}]},
 "heatmap":[{"turn_index":number,"label":"short label","kind":"excelled"|"struggled"|"nervous"|"exceptional","score":0-100,"note":"..."}],
 "consistency":{"score":0-100,"note":"...","flags":["..."]}
}`;
}

export function copilotPrompt(ctx: any, turns: any[]): string {
  return `${contextBlock(ctx)}

INTERVIEW SO FAR
${transcriptBlock(turns)}

You are the recruiter's silent copilot during this live interview. Return ONLY JSON:
{"probes":["3 sharper follow-up questions the panel could ask next, each tied to something the candidate actually said"],
 "watch_for":["2-3 evaluation hints — what to listen for in the next answer"],
 "risks":["0-2 unverified claims or thin areas worth testing"]}`;
}

/** Loads everything an interview call needs: session, turns, signals, role and candidate evidence. */
export async function loadSessionContext(supabase: any, sessionId: string) {
  const { data: session, error } = await supabase
    .from("interview_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!session) throw new Error("Interview session not found.");

  const [{ data: candidate }, { data: turns }, { data: signals }] = await Promise.all([
    supabase.from("candidates").select("*").eq("id", session.candidate_id).maybeSingle(),
    supabase.from("interview_turns").select("*").eq("session_id", sessionId).order("turn_index"),
    supabase.from("interview_signals").select("*").eq("session_id", sessionId).order("offset_ms"),
  ]);

  let application: any = null;
  let job: any = null;
  let priorInterviews: any[] = [];
  if (session.application_id) {
    const { data: app } = await supabase
      .from("applications")
      .select("*")
      .eq("id", session.application_id)
      .maybeSingle();
    application = app;
    const { data: prior } = await supabase
      .from("interviews")
      .select("round_number,round_name,feedback_rating,feedback_summary,feedback_notes")
      .eq("application_id", session.application_id)
      .order("round_number");
    priorInterviews = prior ?? [];
  }
  const jobId = session.job_id ?? application?.job_id;
  if (jobId) {
    const { data: j } = await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle();
    job = j;
  }

  return {
    session,
    candidate,
    job,
    application,
    priorInterviews,
    jobVersion: session.job_version ?? job?.current_version ?? 1,
    turns: turns ?? [],
    signals: signals ?? [],
  };
}

/** Averages the multimodal signal rows captured for one answer. */
export function aggregateSignals(rows: any[]) {
  if (!rows.length) return { frames: 0 };
  const acc: Record<string, Record<string, number[]>> = { face: {}, body: {}, emotion: {}, voice: {} };
  for (const r of rows) {
    for (const group of ["face", "body", "emotion", "voice"] as const) {
      const obj = (r as any)[group] ?? {};
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v !== "number") continue;
        (acc[group]![k] ??= []).push(v);
      }
    }
  }
  const out: Record<string, any> = { frames: rows.length };
  for (const group of ["face", "body", "emotion", "voice"] as const) {
    const g: Record<string, number> = {};
    for (const [k, arr] of Object.entries(acc[group]!)) {
      g[k] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    }
    if (Object.keys(g).length) out[group] = g;
  }
  const notes = rows.map((r) => r.notes).filter(Boolean).slice(-3);
  if (notes.length) out["observer_notes"] = notes;
  return out;
}

export function decodeBase64(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
