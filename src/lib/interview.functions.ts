/**
 * AI Interview Simulator — server function boundary.
 *
 * Every question, evaluation, multimodal reading and final recommendation is
 * produced from real evidence (job description version, resume, screening
 * result, live transcript, webcam signals) and persisted so the whole
 * interview stays replayable and auditable.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { chatJson, DEFAULT_MODEL } from "./ai-gateway.server";
import {
  INTERVIEW_MODEL_VERSION,
  clampScore,
  speechStats,
  type AnswerResult,
  type NextQuestion,
  type ScoreEntry,
} from "./interview";
import {
  EVALUATOR_SYSTEM,
  INTERVIEWER_SYSTEM,
  VISION_SYSTEM,
  aggregateSignals,
  copilotPrompt,
  decodeBase64,
  evaluationPrompt,
  loadSessionContext,
  nextQuestionPrompt,
  summaryPrompt,
  transcribeWav,
  visionJson,
  visionPrompt,
} from "./interview.server";

export const startInterviewSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      candidateId: string;
      applicationId?: string | null;
      roundType: string;
      difficulty: string;
      companyType: string;
      plannedQuestions: number;
      deviceCheck: Record<string, unknown>;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let jobId: string | null = null;
    let jobVersion: number | null = null;
    let roundNumber = 1;
    if (data.applicationId) {
      const { data: app } = await supabase
        .from("applications")
        .select("job_id, job_version")
        .eq("id", data.applicationId)
        .maybeSingle();
      jobId = (app as any)?.job_id ?? null;
      jobVersion = (app as any)?.job_version ?? null;
      const { count } = await supabase
        .from("interview_sessions")
        .select("id", { count: "exact", head: true })
        .eq("application_id", data.applicationId);
      roundNumber = (count ?? 0) + 1;
    }

    const { data: session, error } = await supabase
      .from("interview_sessions")
      .insert({
        candidate_id: data.candidateId,
        application_id: data.applicationId ?? null,
        job_id: jobId,
        job_version: jobVersion,
        round_number: roundNumber,
        round_type: data.roundType,
        difficulty: data.difficulty,
        company_type: data.companyType,
        planned_questions: Math.max(3, Math.min(15, data.plannedQuestions)),
        status: "in_progress",
        device_check: data.deviceCheck as any,
        model: DEFAULT_MODEL,
        model_version: INTERVIEW_MODEL_VERSION,
        started_at: new Date().toISOString(),
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const ctx = await loadSessionContext(supabase, session.id);
    const q = await chatJson<NextQuestion>([
      { role: "system", content: INTERVIEWER_SYSTEM },
      { role: "user", content: nextQuestionPrompt(ctx, [], 0) },
    ]);

    await supabase.from("interview_turns").insert({
      session_id: session.id,
      turn_index: 0,
      kind: q.kind ?? "question",
      competency: q.competency ?? "General",
      question: q.question,
      question_rationale: q.rationale ?? "",
      expected_signals: (q.expected_signals ?? []) as any,
      is_follow_up: false,
      code_submission: q.starter_code ?? null,
      evaluation: (q.test_cases ? { test_cases: q.test_cases } : {}) as any,
    });

    await supabase.from("audit_events").insert({
      actor_id: userId,
      actor_type: "agent",
      action: "interview.simulator.started",
      entity_type: "interview_session",
      entity_id: session.id,
      job_id: jobId,
      summary: `AI interview simulation started (${data.roundType}, ${data.difficulty})`,
      details: { device_check: data.deviceCheck, planned: session.planned_questions, job_version: jobVersion } as any,
      model: DEFAULT_MODEL,
    });

    return { sessionId: session.id as string };
  });

export const transcribeAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { audioBase64: string }) => d)
  .handler(async ({ data }) => {
    const bytes = decodeBase64(data.audioBase64);
    if (bytes.byteLength < 2048) return { text: "" };
    return { text: await transcribeWav(bytes) };
  });

export const analyzeFrames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { sessionId: string; turnIndex: number; offsetMs: number; frames: string[] }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!data.frames.length) throw new Error("No frames captured.");

    const { data: session } = await supabase
      .from("interview_sessions")
      .select("round_type")
      .eq("id", data.sessionId)
      .maybeSingle();

    const reading = await visionJson<{
      face: Record<string, number>;
      body: Record<string, number>;
      emotion: Record<string, number>;
      confidence: number;
      notes: string;
    }>(VISION_SYSTEM, visionPrompt((session as any)?.round_type ?? "technical"), data.frames.slice(0, 3));

    await supabase.from("interview_signals").insert({
      session_id: data.sessionId,
      turn_index: data.turnIndex,
      offset_ms: data.offsetMs,
      source: "vision",
      face: (reading.face ?? {}) as any,
      body: (reading.body ?? {}) as any,
      emotion: (reading.emotion ?? {}) as any,
      notes: reading.notes ?? "",
    });

    return reading;
  });

export const submitAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      sessionId: string;
      turnIndex: number;
      transcript: string;
      seconds: number;
      code?: string;
    }) => d,
  )
  .handler(async ({ data, context }): Promise<AnswerResult> => {
    const { supabase, userId } = context;
    const ctx = await loadSessionContext(supabase, data.sessionId);
    const current = ctx.turns.find((t: any) => t.turn_index === data.turnIndex);
    if (!current) throw new Error("Question not found in this session.");

    const stats = speechStats(data.transcript, data.seconds);
    const observed = aggregateSignals(
      (ctx.signals as any[]).filter((s) => s.turn_index === data.turnIndex),
    );
    const priorTurns = (ctx.turns as any[]).filter((t) => t.turn_index < data.turnIndex);

    const result = await chatJson<{
      evaluation: any;
      voice: Record<string, number>;
      live_feedback: string[];
      scores: ScoreEntry[];
      overall: number;
    }>([
      { role: "system", content: EVALUATOR_SYSTEM },
      {
        role: "user",
        content: evaluationPrompt(ctx, priorTurns, current, data.transcript, stats, observed, data.code),
      },
    ]);

    const scores = (result.scores ?? []).map((s) => ({
      ...s,
      value: clampScore(s.value),
      confidence: clampScore(s.confidence),
      evidence: s.evidence ?? [],
    }));
    const overall = clampScore(
      result.overall ?? (scores.length ? scores.reduce((a, s) => a + s.value, 0) / scores.length : 0),
    );

    await supabase
      .from("interview_turns")
      .update({
        answer_transcript: data.transcript,
        answer_seconds: Math.round(data.seconds),
        evaluation: result.evaluation as any,
        scores: { entries: scores, overall, speech: stats, voice: result.voice ?? {}, observed } as any,
        evidence: (result.evaluation?.strengths ?? []) as any,
        live_feedback: (result.live_feedback ?? []) as any,
        keywords: (result.evaluation?.keywords ?? []) as any,
        code_submission: data.code ?? current.code_submission ?? null,
        confidence: clampScore(result.evaluation?.correctness ?? overall),
        answered_at: new Date().toISOString(),
      })
      .eq("id", current.id);

    if (result.voice && Object.keys(result.voice).length) {
      await supabase.from("interview_signals").insert({
        session_id: data.sessionId,
        turn_index: data.turnIndex,
        offset_ms: Math.round(data.seconds * 1000),
        source: "voice",
        voice: result.voice as any,
        notes: `Speech: ${stats.wpm} wpm · ${stats.fillers} fillers · ${stats.words} words`,
      });
    }

    const answered = priorTurns.length + 1;
    const planned = ctx.session.planned_questions ?? 6;
    let next: NextQuestion | null = null;

    if (answered < planned) {
      const refreshed = await loadSessionContext(supabase, data.sessionId);
      next = await chatJson<NextQuestion>([
        { role: "system", content: INTERVIEWER_SYSTEM },
        { role: "user", content: nextQuestionPrompt(refreshed, refreshed.turns as any[], answered) },
      ]);
      await supabase.from("interview_turns").insert({
        session_id: data.sessionId,
        turn_index: data.turnIndex + 1,
        kind: next.kind ?? "question",
        competency: next.competency ?? "General",
        question: next.question,
        question_rationale: next.rationale ?? "",
        expected_signals: (next.expected_signals ?? []) as any,
        is_follow_up: Boolean(next.is_follow_up),
        code_submission: next.starter_code ?? null,
        evaluation: (next.test_cases ? { test_cases: next.test_cases } : {}) as any,
      });
    }

    await supabase
      .from("interview_sessions")
      .update({
        live_scores: { entries: scores, overall, updated_at: new Date().toISOString() } as any,
        overall_score: overall,
        duration_seconds: (ctx.session.duration_seconds ?? 0) + Math.round(data.seconds),
      })
      .eq("id", data.sessionId);

    await supabase.from("audit_events").insert({
      actor_id: userId,
      actor_type: "agent",
      action: "interview.simulator.answer_evaluated",
      entity_type: "interview_session",
      entity_id: data.sessionId,
      job_id: ctx.job?.id ?? null,
      summary: `Answer ${data.turnIndex + 1} evaluated — running score ${overall}/100`,
      details: { speech: stats, observed_frames: (observed as any)["frames"] ?? 0, live_feedback: result.live_feedback } as any,
      model: DEFAULT_MODEL,
    });

    return {
      evaluation: result.evaluation,
      live_feedback: result.live_feedback ?? [],
      scores,
      overall,
      next,
      finished: next === null,
    };
  });

export const finalizeInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sessionId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ctx = await loadSessionContext(supabase, data.sessionId);
    const answered = (ctx.turns as any[]).filter((t) => t.answered_at);
    if (!answered.length) throw new Error("No answers recorded yet — complete at least one question.");

    const signals = aggregateSignals(ctx.signals as any[]);
    const scores = (ctx.session.live_scores as any)?.entries ?? [];

    const report = await chatJson<{
      summary: any;
      coach: any;
      heatmap: any[];
      consistency: any;
    }>([
      { role: "system", content: EVALUATOR_SYSTEM },
      { role: "user", content: summaryPrompt(ctx, answered, signals, scores) },
    ]);

    const decision = report.summary?.hiring_recommendation?.decision ?? "hold";
    const confidence = clampScore(report.summary?.hiring_recommendation?.confidence ?? 60);

    await supabase
      .from("interview_sessions")
      .update({
        status: "completed",
        summary: report.summary as any,
        coach: report.coach as any,
        heatmap: (report.heatmap ?? []) as any,
        consistency: (report.consistency ?? {}) as any,
        signal_summary: signals as any,
        recommendation: decision,
        recommendation_confidence: confidence,
        ended_at: new Date().toISOString(),
      })
      .eq("id", data.sessionId);

    await supabase.from("audit_events").insert({
      actor_id: userId,
      actor_type: "agent",
      action: "interview.simulator.report_generated",
      entity_type: "interview_session",
      entity_id: data.sessionId,
      job_id: ctx.job?.id ?? null,
      summary: `Interview report generated — ${decision} (${confidence}% confidence)`,
      details: {
        questions: answered.length,
        overall: ctx.session.overall_score,
        consistency: report.consistency,
        model_version: INTERVIEW_MODEL_VERSION,
      } as any,
      model: DEFAULT_MODEL,
    });

    return { ok: true, decision, confidence };
  });

export const interviewCopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sessionId: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = await loadSessionContext(context.supabase, data.sessionId);
    return chatJson<{ probes: string[]; watch_for: string[]; risks: string[] }>([
      { role: "system", content: INTERVIEWER_SYSTEM },
      { role: "user", content: copilotPrompt(ctx, ctx.turns as any[]) },
    ]);
  });

export const addInterviewNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sessionId: string; turnIndex?: number | null; body: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("interview_notes").insert({
      session_id: data.sessionId,
      turn_index: data.turnIndex ?? null,
      body: data.body.slice(0, 4000),
      author_id: userId,
    });
    if (error) throw new Error(error.message);

    await supabase.from("audit_events").insert({
      actor_id: userId,
      actor_type: "human",
      action: "interview.simulator.note_added",
      entity_type: "interview_session",
      entity_id: data.sessionId,
      summary: "Recruiter added a live interview note",
      details: { turn_index: data.turnIndex ?? null } as any,
    });
    return { ok: true };
  });
