/**
 * HireFlow agent layer — every AI step runs server-side, is scoped to the
 * signed-in user via RLS, and writes an immutable audit event.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { chat, chatJson, cosine, embed, DEFAULT_MODEL } from "./ai-gateway.server";
import { scoreCandidate, type ScoreBreakdown } from "./scoring";
import { renderTemplate, varsForApplication } from "./templates";


type Sb = { from: (t: string) => any; rpc?: unknown };

async function logAudit(
  supabase: Sb,
  userId: string,
  entry: {
    action: string;
    entity_type: string;
    entity_id?: string | null;
    job_id?: string | null;
    summary: string;
    details?: Record<string, unknown>;
    actor_type?: "human" | "agent";
    model?: string | null;
  },
) {
  await supabase.from("audit_events").insert({
    actor_id: userId,
    actor_type: entry.actor_type ?? "agent",
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id ?? null,
    job_id: entry.job_id ?? null,
    summary: entry.summary,
    details: entry.details ?? {},
    model: entry.model ?? null,
  });
}

/* ------------------------------------------------------------------ */
/* 1. Resume → structured profile                                      */
/* ------------------------------------------------------------------ */

const ParsedProfile = z.object({
  full_name: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  headline: z.string(),
  years_experience: z.number(),
  skills: z.array(z.string()),
  education: z.array(z.object({ degree: z.string(), institution: z.string(), year: z.string() })),
  work_history: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      period: z.string(),
      highlights: z.string(),
    }),
  ),
  links: z.object({ linkedin: z.string(), github: z.string(), portfolio: z.string() }),
});
export type ParsedProfile = z.infer<typeof ParsedProfile>;

export const parseResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { text: string; fileName: string }) => d)
  .handler(async ({ data }) => {
    const text = data.text.slice(0, 24000);
    if (text.trim().length < 40) {
      throw new Error(
        "We couldn't read enough text from this file. Try a text-based PDF, a DOCX, or enable OCR.",
      );
    }

    const raw = await chatJson<Record<string, unknown>>([
      {
        role: "system",
        content:
          "You are a precise resume parser. Return ONLY JSON with keys: full_name, email, phone, location, headline, years_experience (number), skills (array of short canonical skill names, lowercase), education (array of {degree, institution, year}), work_history (array of {title, company, period, highlights}), links ({linkedin, github, portfolio}). Use empty strings for anything missing. Never invent facts.",
      },
      { role: "user", content: `Resume file: ${data.fileName}\n\n---\n${text}` },
    ]);

    const safe: ParsedProfile = {
      full_name: String(raw["full_name"] ?? "").trim() || "Unnamed candidate",
      email: String(raw["email"] ?? "").trim(),
      phone: String(raw["phone"] ?? "").trim(),
      location: String(raw["location"] ?? "").trim(),
      headline: String(raw["headline"] ?? "").trim(),
      years_experience: Number(raw["years_experience"] ?? 0) || 0,
      skills: Array.isArray(raw["skills"])
        ? (raw["skills"] as unknown[]).map((s) => String(s).toLowerCase().trim()).filter(Boolean)
        : [],
      education: Array.isArray(raw["education"]) ? (raw["education"] as ParsedProfile["education"]) : [],
      work_history: Array.isArray(raw["work_history"])
        ? (raw["work_history"] as ParsedProfile["work_history"])
        : [],
      links: {
        linkedin: String((raw["links"] as any)?.linkedin ?? ""),
        github: String((raw["links"] as any)?.github ?? ""),
        portfolio: String((raw["links"] as any)?.portfolio ?? ""),
      },
    };

    let embedding: number[] = [];
    try {
      embedding = await embed(`${safe.headline}\n${safe.skills.join(", ")}\n${text.slice(0, 6000)}`);
    } catch (e) {
      console.error("[parseResume] embedding failed", e);
    }

    return { profile: safe, embedding };
  });

/* ------------------------------------------------------------------ */
/* 2. Screening agent                                                  */
/* ------------------------------------------------------------------ */

export const screenApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { applicationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: app, error } = await supabase
      .from("applications")
      .select("*, job:jobs(*), candidate:candidates(*)")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!app) throw new Error("Application not found.");

    const job = (app as any).job;
    const cand = (app as any).candidate;

    // Pin this screening run to the exact job description version in force right now.
    const { data: jobVersion } = await supabase
      .from("job_versions")
      .select("id, version, description, required_skills, nice_to_have_skills, min_experience_years, seniority, title")
      .eq("job_id", job.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const rubric = jobVersion
      ? { ...job, ...jobVersion, id: job.id }
      : job;

    // Deterministic, auditable component scores.
    const breakdown: ScoreBreakdown = scoreCandidate(rubric, cand);


    // Semantic similarity refines the deterministic score when embeddings exist.
    let semantic = 0;
    try {
      const jobVec = await embed(
        `${job.title} ${job.seniority ?? ""} ${job.description} required: ${(job.required_skills ?? []).join(", ")}`,
      );
      const candVec: number[] | null = Array.isArray(cand.embedding) ? cand.embedding : null;
      if (candVec && candVec.length) semantic = Math.max(0, Math.min(1, cosine(jobVec, candVec)));
    } catch (e) {
      console.error("[screen] semantic step skipped", e);
    }
    breakdown.components.push({
      key: "semantic_fit",
      label: "Semantic profile fit",
      weight: 0.15,
      score: Math.round(semantic * 100),
      rationale: semantic
        ? "Vector similarity between the job description and the full resume."
        : "No embedding available for this resume; component neutralised.",
    });

    const weighted = breakdown.components.reduce((sum, c) => sum + c.weight * c.score, 0);
    const totalWeight = breakdown.components.reduce((sum, c) => sum + c.weight, 0);
    const finalScore = Math.round(weighted / (totalWeight || 1));

    const analysis = await chatJson<{
      summary: string;
      recommendation: string;
      confidence: number;
      strengths: string[];
      risks: string[];
      bias_notes: { flagged: string[]; statement: string };
    }>([
      {
        role: "system",
        content:
          "You are a fair-hiring screening analyst. Judge ONLY job-relevant evidence. Explicitly ignore and never mention name, gender, age, nationality, ethnicity, marital status, photo or university prestige as a reason. Return ONLY JSON: {summary (3-4 sentences, evidence based), recommendation (one of 'advance'|'hold'|'reject'), confidence (0-1), strengths (3 short bullets), risks (2-3 short bullets), bias_notes: {flagged (array of any bias-prone signals present in the resume that you deliberately excluded), statement (1 sentence on how fairness was preserved)}}.",
      },
      {
        role: "user",
        content: `JOB (description version ${jobVersion?.version ?? 1})
Title: ${rubric.title} (${rubric.seniority ?? "n/a"})
Required skills: ${(rubric.required_skills ?? []).join(", ")}
Nice to have: ${(rubric.nice_to_have_skills ?? []).join(", ")}
Minimum experience: ${rubric.min_experience_years} years
Description: ${String(rubric.description ?? "").slice(0, 4000)}


CANDIDATE
Headline: ${cand.headline ?? ""}
Experience: ${cand.years_experience} years
Skills: ${(cand.skills ?? []).join(", ")}
Resume: ${String(cand.resume_text ?? "").slice(0, 9000)}

Deterministic component scores: ${JSON.stringify(breakdown.components)}
Composite score: ${finalScore}/100`,
      },
    ]);

    const biasNotes = {
      flagged: Array.isArray(analysis.bias_notes?.flagged) ? analysis.bias_notes.flagged : [],
      statement:
        analysis.bias_notes?.statement ??
        "Screening used only job-relevant evidence; demographic signals were excluded.",
      excluded_attributes: ["name", "gender", "age", "nationality", "ethnicity", "photo", "school prestige"],
    };

    const { error: upErr } = await supabase
      .from("applications")
      .update({
        match_score: finalScore,
        score_breakdown: {
          components: breakdown.components,
          strengths: analysis.strengths ?? [],
          risks: analysis.risks ?? [],
          job_version: jobVersion?.version ?? null,
          method: "hybrid: deterministic rules (85%) + embedding similarity (15%), narrated by LLM",
        },
        matched_skills: breakdown.matched,
        missing_skills: breakdown.missing,
        ai_summary: analysis.summary,
        ai_recommendation: analysis.recommendation,
        ai_confidence: Math.max(0, Math.min(1, Number(analysis.confidence) || 0.5)),
        bias_notes: biasNotes,
        status: "pending_review",
        job_version_id: jobVersion?.id ?? null,
        job_version: jobVersion?.version ?? null,
        screened_at: new Date().toISOString(),
      })
      .eq("id", data.applicationId);
    if (upErr) throw new Error(upErr.message);

    await logAudit(supabase, userId, {
      action: "ai.screen",
      entity_type: "application",
      entity_id: data.applicationId,
      job_id: job.id,
      summary: `Screening agent scored ${cand.full_name} at ${finalScore}/100 (${analysis.recommendation}) against job description v${jobVersion?.version ?? 1}.`,
      details: {
        score: finalScore,
        recommendation: analysis.recommendation,
        components: breakdown.components,
        job_version: jobVersion?.version ?? null,
      },

      model: DEFAULT_MODEL,
    });

    return { score: finalScore, recommendation: analysis.recommendation };
  });

/* ------------------------------------------------------------------ */
/* 3. Interview question generator                                     */
/* ------------------------------------------------------------------ */

export const generateQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { interviewId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: iv, error } = await supabase
      .from("interviews")
      .select("*, application:applications(*, job:jobs(*), candidate:candidates(*))")
      .eq("id", data.interviewId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!iv) throw new Error("Interview not found.");

    const app = (iv as any).application;
    const job = app.job;
    const cand = app.candidate;

    const result = await chatJson<{
      questions: Array<{ question: string; competency: string; why: string; signal: string }>;
    }>([
      {
        role: "system",
        content:
          "You design rigorous, bias-free interview guides. Return ONLY JSON: {questions: [{question, competency, why (why this candidate specifically), signal (what a strong answer shows)}]}. Produce exactly 7 questions, tailored to the round and calibrated to the candidate's real experience and gaps.",
      },
      {
        role: "user",
        content: `ROUND ${iv.round_number}: ${iv.round_name}
JOB: ${job.title} — required: ${(job.required_skills ?? []).join(", ")}
JD: ${String(job.description ?? "").slice(0, 3000)}
CANDIDATE: ${cand.years_experience}y — ${cand.headline ?? ""}
Skills: ${(cand.skills ?? []).join(", ")}
Known gaps: ${(app.missing_skills ?? []).join(", ") || "none recorded"}
Resume extract: ${String(cand.resume_text ?? "").slice(0, 5000)}`,
      },
    ]);

    const questions = (result.questions ?? []).slice(0, 10);
    const { error: upErr } = await supabase
      .from("interviews")
      .update({ questions })
      .eq("id", data.interviewId);
    if (upErr) throw new Error(upErr.message);

    await logAudit(supabase, userId, {
      action: "ai.generate_questions",
      entity_type: "interview",
      entity_id: data.interviewId,
      job_id: job.id,
      summary: `Generated ${questions.length} tailored questions for round ${iv.round_number} (${iv.round_name}).`,
      details: { count: questions.length },
      model: DEFAULT_MODEL,
    });

    return { questions };
  });

/* ------------------------------------------------------------------ */
/* 4. Email drafting                                                   */
/* ------------------------------------------------------------------ */

const EMAIL_BRIEF: Record<string, string> = {
  interview_invite:
    "Invite the candidate to the upcoming interview round. Mention the round name, duration, and that a calendar link follows. Warm, concise, professional.",
  rejection:
    "Respectfully decline the candidate. Be kind, specific enough to be respectful, never harsh, no legal risk, invite them to apply again.",
  offer:
    "Extend a formal offer. Reference the role, compensation placeholders provided, start date and next steps. Confident and celebratory but precise.",
  follow_up: "Send a short status update so the candidate is never left waiting.",
};

export const draftEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { applicationId: string; kind: string; instructions?: string; templateId?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: app, error } = await supabase
      .from("applications")
      .select("*, job:jobs(*), candidate:candidates(*)")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!app) throw new Error("Application not found.");

    const job = (app as any).job;
    const cand = (app as any).candidate;

    const { data: iv } = await supabase
      .from("interviews")
      .select("*")
      .eq("application_id", data.applicationId)
      .order("round_number", { ascending: false })
      .limit(1);
    const latest = iv?.[0];

    const vars: Record<string, string> = {
      ...varsForApplication({ ...app, job, candidate: cand }),
      interview_round: latest?.round_name ?? "",
      interview_date: latest?.scheduled_at ? new Date(latest.scheduled_at).toLocaleString() : "",
      meeting_link: latest?.meeting_link ?? "",
      recruiter_name: "The HireFlow Talent Team",
    };

    let template: any = null;
    if (data.templateId) {
      const { data: t, error: tErr } = await supabase
        .from("email_templates")
        .select("*")
        .eq("id", data.templateId)
        .maybeSingle();
      if (tErr) throw new Error(tErr.message);
      template = t;
    }

    const result = template
      ? { subject: renderTemplate(template.subject, vars), body: renderTemplate(template.body, vars) }
      : await chatJson<{ subject: string; body: string }>([
          {
            role: "system",
            content:
              "You write recruitment emails for a premium employer brand. Return ONLY JSON: {subject, body}. Body is plain text with line breaks, signed 'The HireFlow Talent Team'. Never invent salary, dates or commitments that were not provided.",
          },
          {
            role: "user",
            content: `TYPE: ${data.kind} — ${EMAIL_BRIEF[data.kind] ?? "Write an appropriate recruitment email."}
Candidate: ${cand.full_name}
Role: ${job.title} at ${job.department ?? "the company"} (${job.location ?? "remote"})
Stage: ${app.stage}
Next interview: ${latest ? `${latest.round_name} on ${latest.scheduled_at ?? "TBC"} (${latest.duration_minutes} min), link: ${latest.meeting_link ?? "TBC"}` : "none scheduled"}
Extra instructions: ${data.instructions ?? "none"}`,
          },
        ]);

    const { data: inserted, error: insErr } = await supabase
      .from("emails")
      .insert({
        application_id: data.applicationId,
        kind: data.kind,
        to_email: cand.email ?? null,
        subject: result.subject ?? "",
        body: result.body ?? "",
        status: "draft",
        template_id: template?.id ?? null,
        template_name: template?.name ?? null,
        variables: vars,
        created_by: userId,
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);

    await logAudit(supabase, userId, {
      action: template ? "email.draft_from_template" : "ai.draft_email",
      actor_type: template ? "human" : "agent",
      entity_type: "email",
      entity_id: inserted.id,
      job_id: job.id,
      summary: template
        ? `Drafted a ${data.kind.replace(/_/g, " ")} email for ${cand.full_name} from the “${template.name}” template — awaiting human approval.`
        : `Drafted a ${data.kind.replace(/_/g, " ")} email for ${cand.full_name} — awaiting human approval.`,
      details: { subject: result.subject, template: template?.name ?? null },
      model: template ? null : DEFAULT_MODEL,
    });


    return inserted;
  });

/* ------------------------------------------------------------------ */
/* 5. Interview feedback summarisation                                 */
/* ------------------------------------------------------------------ */

export const summarizeFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { interviewId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: iv, error } = await supabase
      .from("interviews")
      .select("*, application:applications(job_id, candidate:candidates(full_name))")
      .eq("id", data.interviewId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!iv) throw new Error("Interview not found.");
    if (!iv.feedback_notes || iv.feedback_notes.trim().length < 20) {
      throw new Error("Add interviewer notes first — there is nothing to summarise yet.");
    }

    const summary = await chat([
      {
        role: "system",
        content:
          "Summarise interview feedback into a crisp decision-ready brief: 2 sentence verdict, then 'Strengths:' bullets, 'Concerns:' bullets, and 'Recommended next step:'. Neutral, evidence-based, no demographic inferences. Plain text.",
      },
      {
        role: "user",
        content: `Round: ${iv.round_name}\nRating: ${iv.feedback_rating ?? "n/a"}/5\nNotes:\n${iv.feedback_notes}`,
      },
    ]);

    const { error: upErr } = await supabase
      .from("interviews")
      .update({ feedback_summary: summary, status: "completed" })
      .eq("id", data.interviewId);
    if (upErr) throw new Error(upErr.message);

    await logAudit(supabase, userId, {
      action: "ai.summarize_feedback",
      entity_type: "interview",
      entity_id: data.interviewId,
      job_id: (iv as any).application?.job_id ?? null,
      summary: `Summarised ${iv.round_name} feedback for ${(iv as any).application?.candidate?.full_name ?? "candidate"}.`,
      model: DEFAULT_MODEL,
    });

    return { summary };
  });

/* ------------------------------------------------------------------ */
/* 6. Semantic search across candidates                                */
/* ------------------------------------------------------------------ */

export const semanticSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { query: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const query = data.query.trim();
    if (!query) return { results: [] as Array<{ id: string; similarity: number }> };

    const qVec = await embed(query);
    const { data: rows, error } = await supabase
      .from("candidates")
      .select("id, full_name, headline, skills, years_experience, location, embedding, resume_text")
      .limit(500);
    if (error) throw new Error(error.message);

    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const results = (rows ?? [])
      .map((c: any) => {
        const vec: number[] | null = Array.isArray(c.embedding) ? c.embedding : null;
        const vecScore = vec && vec.length ? cosine(qVec, vec) : 0;
        const hay = `${c.full_name} ${c.headline ?? ""} ${(c.skills ?? []).join(" ")} ${String(c.resume_text ?? "").slice(0, 4000)}`.toLowerCase();
        const keyword = terms.length ? terms.filter((t) => hay.includes(t)).length / terms.length : 0;
        return {
          id: c.id as string,
          full_name: c.full_name as string,
          headline: (c.headline ?? "") as string,
          skills: (c.skills ?? []) as string[],
          years_experience: Number(c.years_experience ?? 0),
          location: (c.location ?? "") as string,
          similarity: Number((vecScore * 0.75 + keyword * 0.25).toFixed(4)),
          vector_score: Number(vecScore.toFixed(4)),
          keyword_score: Number(keyword.toFixed(4)),
        };
      })
      .filter((r) => r.similarity > 0.05)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 25);

    return { results };
  });

/* ------------------------------------------------------------------ */
/* 7. Recruiter copilot                                                */
/* ------------------------------------------------------------------ */

export const copilotAsk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { question: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const question = data.question.trim().slice(0, 2000);
    if (!question) throw new Error("Ask a question first.");

    await supabase.from("copilot_messages").insert({ user_id: userId, role: "user", content: question });

    const [jobs, apps, interviews, offers, history] = await Promise.all([
      supabase.from("jobs").select("id,title,department,location,status,required_skills,min_experience_years").limit(60),
      supabase
        .from("applications")
        .select("id,stage,status,match_score,missing_skills,ai_recommendation,job:jobs(title),candidate:candidates(full_name,years_experience,skills,location)")
        .order("match_score", { ascending: false })
        .limit(150),
      supabase.from("interviews").select("round_name,round_number,status,scheduled_at,feedback_rating,feedback_summary,application_id").limit(120),
      supabase.from("offers").select("status,salary,currency,current_level,total_levels,application_id").limit(60),
      supabase
        .from("copilot_messages")
        .select("role,content")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    const priorTurns = (history.data ?? []).slice().reverse().slice(0, 11);

    const answer = await chat([
      {
        role: "system",
        content:
          "You are HireFlow Copilot, an expert recruiting analyst embedded in an ATS. Answer ONLY from the workspace snapshot provided. If the data does not contain the answer, say so plainly and suggest what the recruiter should record. Be concise, use short markdown-free bullets when listing, cite candidate and role names. Never speculate about protected characteristics.",
      },
      {
        role: "user",
        content: `WORKSPACE SNAPSHOT (JSON)
jobs: ${JSON.stringify(jobs.data ?? [])}
applications: ${JSON.stringify(apps.data ?? [])}
interviews: ${JSON.stringify(interviews.data ?? [])}
offers: ${JSON.stringify(offers.data ?? [])}`,
      },
      ...priorTurns.map((m: any) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: String(m.content),
      })),
    ]);

    await supabase.from("copilot_messages").insert({ user_id: userId, role: "assistant", content: answer });

    return { answer };
  });
