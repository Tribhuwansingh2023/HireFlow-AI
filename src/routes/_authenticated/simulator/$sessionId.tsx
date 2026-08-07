import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  BrainCircuit,
  ChevronDown,
  Circle,
  FileText,
  Gauge,
  Loader2,
  Mic,
  NotebookPen,
  Radio,
  Send,
  Sparkles,
  Square,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { LoadingPanel, Pill, ScoreRing } from "@/components/ui-kit";
import {
  CompetencyRadar,
  EmotionStrip,
  FeedbackChip,
  HeatmapStrip,
  MetricBar,
  RecommendationBadge,
  SignalGrid,
  WaveMeter,
} from "@/components/interview-visuals";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  addInterviewNote,
  analyzeFrames,
  finalizeInterview,
  interviewCopilot,
  submitAnswer,
  transcribeAnswer,
} from "@/lib/interview.functions";
import { ROUND_LABEL, speechStats, type RoundType } from "@/lib/interview";
import { VoiceRecorder, blobToBase64, captureFrame, requestMedia, stopStream } from "@/lib/media";

export const Route = createFileRoute("/_authenticated/simulator/$sessionId")({
  head: () => ({
    meta: [
      { title: "Live AI interview — HireFlow AI" },
      {
        name: "description",
        content:
          "Adaptive AI interview room with live transcription, multimodal engagement signals, real-time scoring and an auditable executive report.",
      },
      { property: "og:title", content: "Live AI interview — HireFlow AI" },
      { property: "og:description", content: "Adaptive AI interview room with real-time multimodal scoring." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InterviewRoom,
});

function InterviewRoom() {
  const { sessionId } = Route.useParams();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["interview-session", sessionId],
    queryFn: async () => {
      const [{ data: session, error }, { data: turns }, { data: signals }, { data: notes }] = await Promise.all([
        supabase
          .from("interview_sessions")
          .select("*, candidate:candidates(id, full_name, headline, years_experience), job:jobs(id, title, seniority)")
          .eq("id", sessionId)
          .maybeSingle(),
        supabase.from("interview_turns").select("*").eq("session_id", sessionId).order("turn_index"),
        supabase.from("interview_signals").select("*").eq("session_id", sessionId).order("offset_ms"),
        supabase.from("interview_notes").select("*").eq("session_id", sessionId).order("created_at"),
      ]);
      if (error) throw error;
      return { session, turns: turns ?? [], signals: signals ?? [], notes: notes ?? [] };
    },
  });

  if (isLoading) return <LoadingPanel rows={6} label="Loading interview room" />;
  if (!data?.session) {
    return <p className="text-sm text-muted-foreground">This interview session no longer exists.</p>;
  }

  const session = data.session as any;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to="/simulator" className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> All interviews
          </Link>
          <h1 className="font-display text-2xl font-semibold text-foreground">
            {session.candidate?.full_name ?? "Candidate"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {session.job?.title ?? "No role linked"} · Round {session.round_number} ·{" "}
            {ROUND_LABEL[session.round_type as RoundType] ?? session.round_type} · {session.difficulty} ·{" "}
            {session.company_type} style · model {session.model_version}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {session.recommendation ? (
            <RecommendationBadge decision={session.recommendation} confidence={session.recommendation_confidence} />
          ) : (
            <Pill tone={session.status === "in_progress" ? "amber" : "neutral"}>
              {session.status === "in_progress" ? "Interview in progress" : session.status}
            </Pill>
          )}
          <ScoreRing score={session.overall_score} size={56} />
        </div>
      </div>

      {session.status === "completed" ? (
        <ReportView session={session} turns={data.turns} signals={data.signals} notes={data.notes} onChange={refetch} />
      ) : (
        <LiveView
          session={session}
          turns={data.turns}
          signals={data.signals}
          notes={data.notes}
          onChange={async () => {
            await refetch();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ live ---- */

function LiveView({
  session,
  turns,
  signals,
  notes,
  onChange,
}: {
  session: any;
  turns: any[];
  signals: any[];
  notes: any[];
  onChange: () => Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const frameTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const tickTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const current = useMemo(() => turns.find((t) => !t.answered_at) ?? null, [turns]);
  const answered = turns.filter((t) => t.answered_at);

  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [code, setCode] = useState<string>("");
  const [feedback, setFeedback] = useState<string[]>([]);
  const [liveSignal, setLiveSignal] = useState<any>(null);
  const [copilot, setCopilot] = useState<any>(null);
  const [note, setNote] = useState("");

  const analyze = useServerFn(analyzeFrames);
  const transcribe = useServerFn(transcribeAnswer);
  const submit = useServerFn(submitAnswer);
  const finalize = useServerFn(finalizeInterview);
  const hints = useServerFn(interviewCopilot);
  const saveNote = useServerFn(addInterviewNote);

  useEffect(() => {
    setCode(current?.code_submission ?? "");
    setTranscript("");
  }, [current?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await requestMedia();
        if (cancelled) return stopStream(stream);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch {
        toast.error("Camera and microphone access is required for this interview.");
      }
    })();
    return () => {
      cancelled = true;
      if (frameTimer.current) clearInterval(frameTimer.current);
      if (tickTimer.current) clearInterval(tickTimer.current);
      void recorderRef.current?.stop().catch(() => undefined);
      stopStream(streamRef.current);
    };
  }, []);

  const sampleFrames = useCallback(async () => {
    if (!videoRef.current || !current) return;
    const frames = [captureFrame(videoRef.current)].filter(Boolean) as string[];
    if (!frames.length) return;
    try {
      const reading = await analyze({
        data: {
          sessionId: session.id,
          turnIndex: current.turn_index,
          offsetMs: Math.round((recorderRef.current?.seconds ?? 0) * 1000),
          frames,
        },
      });
      setLiveSignal(reading);
    } catch {
      /* transient signal failures must never interrupt the interview */
    }
  }, [analyze, current, session.id]);

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) {
      toast.error("Camera not ready yet.");
      return;
    }
    const rec = new VoiceRecorder();
    rec.start(stream, setLevel);
    recorderRef.current = rec;
    setRecording(true);
    setElapsed(0);
    setFeedback([]);
    tickTimer.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    void sampleFrames();
    frameTimer.current = setInterval(() => void sampleFrames(), 14000);
  }

  async function stopAndSubmit() {
    if (!current || !recorderRef.current) return;
    if (frameTimer.current) clearInterval(frameTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    setRecording(false);

    const { blob, seconds } = await recorderRef.current.stop();
    recorderRef.current = null;

    let text = transcript.trim();
    if (blob.size > 4096) {
      setBusy("Transcribing your answer…");
      try {
        const b64 = await blobToBase64(blob);
        const res = await transcribe({ data: { audioBase64: b64 } });
        if (res.text.trim()) text = res.text.trim();
      } catch (e: any) {
        toast.error(e?.message ?? "Transcription failed — type the answer instead.");
      }
    }
    setBusy(null);

    if (!text) {
      setTranscript("");
      toast.error("No speech captured. Record again or type the answer below.");
      return;
    }
    setTranscript(text);
    await evaluate(text, Math.max(seconds, 1));
  }

  async function evaluate(text: string, seconds: number) {
    if (!current) return;
    setBusy("Assessing the answer and preparing the next question…");
    try {
      const result = await submit({
        data: {
          sessionId: session.id,
          turnIndex: current.turn_index,
          transcript: text,
          seconds: Math.round(seconds),
          ...(code ? { code } : {}),
        },
      });
      setFeedback(result.live_feedback ?? []);
      setTranscript("");
      await onChange();
      if (result.finished) toast.success("All questions answered — generate the report.");
    } catch (e: any) {
      toast.error(e?.message ?? "The assessor could not evaluate that answer.");
    } finally {
      setBusy(null);
    }
  }

  const liveScores = (session.live_scores as any)?.entries ?? [];
  const stats = transcript ? speechStats(transcript, Math.max(elapsed, 1)) : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
      <div className="space-y-5">
        <div className="panel overflow-hidden p-0">
          <div className="relative aspect-video w-full bg-black">
            <video ref={videoRef} muted playsInline className="size-full object-cover" />
            {recording ? (
              <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full border border-destructive/40 bg-black/60 px-3 py-1 text-[11px] text-destructive backdrop-blur">
                <Circle className="size-2 animate-pulse fill-current" /> REC {formatTime(elapsed)}
              </div>
            ) : null}
            <div className="absolute right-3 bottom-3 left-3 flex flex-wrap items-end justify-between gap-3">
              <div className="rounded-xl border border-white/10 bg-black/50 px-3 py-2 backdrop-blur">
                <WaveMeter level={level} active={recording} />
              </div>
              {liveSignal ? (
                <div className="max-w-xs rounded-xl border border-white/10 bg-black/55 p-3 backdrop-blur">
                  <p className="mb-2 text-[10px] tracking-[0.18em] text-white/50 uppercase">Live signals</p>
                  <div className="space-y-1.5">
                    <MetricBar label="Eye Contact" value={liveSignal.face?.["Eye Contact"] ?? 0} compact />
                    <MetricBar label="Confidence" value={liveSignal.face?.["Confidence"] ?? 0} compact />
                    <MetricBar label="Stress Level" value={liveSignal.face?.["Stress Level"] ?? 0} compact />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {current ? (
          <div className="panel space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Pill tone="primary">
                  Question {current.turn_index + 1} of {session.planned_questions}
                </Pill>
                {current.is_follow_up ? <Pill tone="amber">Adaptive follow-up</Pill> : null}
                <Pill tone="neutral">{current.competency}</Pill>
              </div>
              <span className="text-[11px] text-muted-foreground">{answered.length} answered</span>
            </div>

            <p className="font-display text-lg leading-relaxed text-foreground">{current.question}</p>
            {current.question_rationale ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="text-primary">Why this question:</span> {current.question_rationale}
              </p>
            ) : null}
            {(current.expected_signals ?? []).length ? (
              <div className="flex flex-wrap gap-1.5">
                {(current.expected_signals as string[]).map((s) => (
                  <span key={s} className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                    {s}
                  </span>
                ))}
              </div>
            ) : null}

            {(current.kind === "coding" || session.round_type === "coding") && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Code submission (evaluated for correctness, complexity, readability and structure)</p>
                <Textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  rows={10}
                  spellCheck={false}
                  className="font-mono text-xs"
                  placeholder="// write your solution here"
                />
                {(current.evaluation?.test_cases ?? []).length ? (
                  <div className="rounded-lg border border-border/60 bg-card/40 p-3 text-[11px] text-muted-foreground">
                    <p className="mb-1 text-foreground/80">Test cases</p>
                    {(current.evaluation.test_cases as any[]).map((t, i) => (
                      <p key={i} className="font-mono">
                        {t.input} → {t.expected}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {recording ? (
                <Button variant="destructive" className="gap-2" onClick={() => void stopAndSubmit()}>
                  <Square className="size-4" /> Stop & submit answer
                </Button>
              ) : (
                <Button className="gap-2" disabled={Boolean(busy)} onClick={startRecording}>
                  <Mic className="size-4" /> Record answer
                </Button>
              )}
              <Button
                variant="secondary"
                className="gap-2"
                disabled={Boolean(busy) || !transcript.trim()}
                onClick={() => void evaluate(transcript.trim(), Math.max(elapsed, 20))}
              >
                <Send className="size-4" /> Submit typed answer
              </Button>
              {busy ? (
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> {busy}
                </span>
              ) : null}
            </div>

            <Textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={4}
              placeholder="Live transcript appears here after recording — edit it if the transcription missed something, or type the answer directly."
              className="text-sm"
            />
            {stats ? (
              <p className="font-mono text-[11px] text-muted-foreground">
                {stats.words} words · {stats.wpm} wpm · {stats.fillers} fillers · {stats.lexical_diversity}% lexical
                diversity
              </p>
            ) : null}

            {feedback.length ? (
              <div className="flex flex-wrap gap-2">
                {feedback.map((f) => (
                  <FeedbackChip key={f} text={f} />
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="panel space-y-3 p-6 text-center">
            <Sparkles className="mx-auto size-6 text-primary" />
            <p className="text-sm text-foreground">All {answered.length} questions answered.</p>
            <p className="text-xs text-muted-foreground">
              Generate the executive report to score the interview, run the resume-consistency check and record the
              hiring recommendation in the audit trail.
            </p>
            <Button
              className="gap-2"
              disabled={Boolean(busy)}
              onClick={async () => {
                setBusy("Generating the executive report…");
                try {
                  await finalize({ data: { sessionId: session.id } });
                  await onChange();
                  toast.success("Interview report ready");
                } catch (e: any) {
                  toast.error(e?.message ?? "Report generation failed.");
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} Generate report
            </Button>
          </div>
        )}

        <AnsweredList turns={answered} />
      </div>

      <div className="space-y-5">
        <div className="panel p-5">
          <div className="mb-3 flex items-center gap-2">
            <Gauge className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Live scorecard</h2>
          </div>
          {liveScores.length ? (
            <>
              <CompetencyRadar entries={liveScores.map((s: any) => ({ key: s.key, value: s.value }))} />
              <div className="mt-2 space-y-2.5">
                {liveScores.map((s: any) => (
                  <MetricBar key={s.key} label={s.key} value={s.value} hint={s.reason} />
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Scores appear after the first answer is assessed.</p>
          )}
        </div>

        {liveSignal ? (
          <div className="panel space-y-3 p-5">
            <h2 className="text-sm font-semibold text-foreground">Emotion & behaviour</h2>
            <EmotionStrip emotion={liveSignal.emotion} />
            <SignalGrid title="Facial signals" data={liveSignal.face} />
            <SignalGrid title="Body language" data={liveSignal.body} />
            {liveSignal.notes ? <p className="text-[11px] text-muted-foreground">{liveSignal.notes}</p> : null}
          </div>
        ) : null}

        <div className="panel space-y-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BrainCircuit className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Recruiter copilot</h2>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="gap-1.5"
              onClick={async () => {
                try {
                  setCopilot(await hints({ data: { sessionId: session.id } }));
                } catch (e: any) {
                  toast.error(e?.message ?? "Copilot unavailable right now.");
                }
              }}
            >
              <Wand2 className="size-3.5" /> Suggest
            </Button>
          </div>
          {copilot ? (
            <div className="space-y-3 text-xs">
              <CopilotList title="Sharper probes" items={copilot.probes} />
              <CopilotList title="Watch for" items={copilot.watch_for} />
              <CopilotList title="Unverified claims" items={copilot.risks} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Ask the copilot for follow-up probes grounded in what the candidate has actually said so far.
            </p>
          )}
        </div>

        <div className="panel space-y-3 p-5">
          <div className="flex items-center gap-2">
            <NotebookPen className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Panel notes</h2>
          </div>
          <div className="space-y-2">
            {notes.map((n: any) => (
              <p key={n.id} className="rounded-lg border border-border/60 bg-card/40 p-2.5 text-xs text-foreground/85">
                {n.body}
                <span className="mt-1 block text-[10px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleTimeString()}
                </span>
              </p>
            ))}
          </div>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Add a human observation…" />
          <Button
            size="sm"
            variant="secondary"
            disabled={!note.trim()}
            onClick={async () => {
              try {
                await saveNote({
                  data: { sessionId: session.id, turnIndex: current?.turn_index ?? null, body: note.trim() },
                });
                setNote("");
                await onChange();
              } catch (e: any) {
                toast.error(e?.message ?? "Could not save the note.");
              }
            }}
          >
            Save note
          </Button>
        </div>
      </div>
    </div>
  );
}

function CopilotList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-1 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">{title}</p>
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i} className="rounded-lg border border-border/60 bg-card/40 p-2 text-foreground/85">
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatTime(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/* ---------------------------------------------------------------- report ---- */

function AnsweredList({ turns }: { turns: any[] }) {
  if (!turns.length) return null;
  return (
    <div className="panel space-y-2 p-5">
      <h2 className="mb-1 text-sm font-semibold text-foreground">Answered so far</h2>
      {turns.map((t) => (
        <TurnCard key={t.id} turn={t} />
      ))}
    </div>
  );
}

function TurnCard({ turn }: { turn: any }) {
  const [open, setOpen] = useState(false);
  const scores = turn.scores ?? {};
  const evaluation = turn.evaluation ?? {};
  return (
    <div className="rounded-xl border border-border/60 bg-card/40">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 p-3 text-left">
        <span className="font-mono text-[11px] text-muted-foreground">Q{turn.turn_index + 1}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">{turn.question}</span>
        <span className="font-mono text-xs text-foreground/80">{Math.round(scores.overall ?? 0)}</span>
        <ChevronDown className={`size-4 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="space-y-4 border-t border-border/60 p-4">
          <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/80">{turn.answer_transcript}</p>

          {(turn.keywords ?? []).length ? (
            <div className="flex flex-wrap gap-1.5">
              {(turn.keywords as any[]).map((k, i) => (
                <span
                  key={`${k.term}-${i}`}
                  className={`rounded-md px-2 py-0.5 text-[11px] ${
                    k.kind === "issue"
                      ? "bg-destructive/12 text-destructive"
                      : k.kind === "technical"
                        ? "bg-primary/12 text-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {k.term}
                </span>
              ))}
            </div>
          ) : null}

          {evaluation.reasoning ? (
            <p className="text-xs leading-relaxed text-muted-foreground">{evaluation.reasoning}</p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {["correctness", "depth", "logical_thinking", "problem_solving", "system_design", "coding_knowledge", "project_understanding", "architecture", "real_world_thinking"]
              .filter((k) => typeof evaluation[k] === "number")
              .map((k) => (
                <MetricBar key={k} label={k.replace(/_/g, " ")} value={evaluation[k]} compact />
              ))}
          </div>

          {scores.speech ? (
            <p className="font-mono text-[11px] text-muted-foreground">
              {scores.speech.words} words · {scores.speech.wpm} wpm · {scores.speech.fillers} fillers ·{" "}
              {turn.answer_seconds}s
            </p>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            <SignalGrid title="Voice analysis" data={scores.voice} />
            <SignalGrid title="Observed behaviour" data={scores.observed?.face} />
          </div>

          {evaluation.consistency ? (
            <div className="rounded-lg border border-border/60 bg-card/40 p-3 text-xs">
              <p className="text-foreground/85">
                Resume consistency: <span className="font-mono">{evaluation.consistency.score}/100</span>
              </p>
              <p className="mt-1 text-muted-foreground">{evaluation.consistency.note}</p>
            </div>
          ) : null}

          {turn.code_submission ? (
            <pre className="overflow-x-auto rounded-lg border border-border/60 bg-background/60 p-3 font-mono text-[11px] text-foreground/80">
              {turn.code_submission}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ReportView({
  session,
  turns,
  signals,
  notes,
  onChange,
}: {
  session: any;
  turns: any[];
  signals: any[];
  notes: any[];
  onChange: () => void;
}) {
  const summary = session.summary ?? {};
  const rec = summary.hiring_recommendation ?? {};
  const coach = session.coach ?? {};
  const scores = (session.live_scores as any)?.entries ?? [];
  const signalSummary = session.signal_summary ?? {};

  return (
    <div className="space-y-6">
      <div className="panel space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-foreground">Executive summary</h2>
          <RecommendationBadge decision={session.recommendation} confidence={session.recommendation_confidence} />
        </div>
        <p className="text-sm leading-relaxed text-foreground/85">{summary.executive_summary}</p>

        <div className="grid gap-4 md:grid-cols-3">
          <Detail title="Technical level" body={summary.technical_level} />
          <Detail title="Communication" body={summary.communication} />
          <Detail title="Leadership" body={summary.leadership} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <ListBlock title="Strengths" items={summary.strengths} tone="success" />
          <ListBlock title="Weaknesses" items={summary.weaknesses} tone="warning" />
          <ListBlock title="Risk factors" items={summary.risk_factors} tone="warning" />
          <ListBlock title="Training needs" items={summary.training_needs} />
        </div>

        {summary.salary_range ? (
          <div className="rounded-xl border border-border/60 bg-card/40 p-4">
            <p className="text-xs text-muted-foreground">Suggested salary range</p>
            <p className="font-display text-xl text-foreground">
              {summary.salary_range.currency} {summary.salary_range.min?.toLocaleString()} –{" "}
              {summary.salary_range.max?.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{summary.salary_range.note}</p>
          </div>
        ) : null}

        <div className="rounded-xl border border-primary/25 bg-primary/6 p-4">
          <p className="text-xs font-medium text-primary">Why this recommendation</p>
          <p className="mt-1 text-sm text-foreground/85">{rec.why}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <ListBlock title="Interview evidence" items={rec.transcript_support} />
            <ListBlock title="Resume evidence" items={rec.resume_support} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="panel p-5">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Competency profile</h2>
          <CompetencyRadar entries={scores.map((s: any) => ({ key: s.key, value: s.value }))} />
          <div className="mt-3 space-y-2.5">
            {scores.map((s: any) => (
              <MetricBar key={s.key} label={s.key} value={s.value} hint={s.reason} />
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="panel space-y-3 p-5">
            <h2 className="text-sm font-semibold text-foreground">Aggregated signals</h2>
            <EmotionStrip emotion={signalSummary.emotion} />
            <SignalGrid title="Voice" data={signalSummary.voice} />
            <SignalGrid title="Facial" data={signalSummary.face} />
            <SignalGrid title="Body language" data={signalSummary.body} />
            <p className="text-[11px] text-muted-foreground">
              {signals.length} multimodal readings captured across {turns.filter((t) => t.answered_at).length} answers.
            </p>
          </div>

          {session.consistency?.score !== undefined ? (
            <div className="panel space-y-2 p-5">
              <h2 className="text-sm font-semibold text-foreground">Resume consistency check</h2>
              <MetricBar label="Consistency" value={session.consistency.score ?? 0} />
              <p className="text-xs text-muted-foreground">{session.consistency.note}</p>
              {(session.consistency.flags ?? []).map((f: string) => (
                <p key={f} className="rounded-lg border border-warning/25 bg-warning/8 p-2 text-[11px] text-warning">
                  {f}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {(session.heatmap ?? []).length ? (
        <div className="panel space-y-3 p-5">
          <h2 className="text-sm font-semibold text-foreground">Interview heatmap</h2>
          <HeatmapStrip points={session.heatmap} />
        </div>
      ) : null}

      {coach.items?.length ? (
        <div className="panel space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Radio className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Improvement coach</h2>
          </div>
          <p className="text-xs text-muted-foreground">{coach.summary}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {coach.items.map((i: any) => (
              <div key={i.area} className="rounded-xl border border-border/60 bg-card/40 p-3">
                <p className="text-sm text-foreground">{i.area}</p>
                <p className="mt-1 text-xs text-muted-foreground">{i.advice}</p>
                <p className="mt-2 text-[11px] text-primary">Drill: {i.drill}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Expected improvement in ~{i.improvement_weeks} weeks
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="panel space-y-2 p-5">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Full replay</h2>
        {turns
          .filter((t) => t.answered_at)
          .map((t) => (
            <TurnCard key={t.id} turn={t} />
          ))}
      </div>

      {notes.length ? (
        <div className="panel space-y-2 p-5">
          <h2 className="text-sm font-semibold text-foreground">Panel notes</h2>
          {notes.map((n: any) => (
            <p key={n.id} className="rounded-lg border border-border/60 bg-card/40 p-2.5 text-xs text-foreground/85">
              {n.body}
            </p>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="secondary" className="gap-2">
          <Link to="/twin/$candidateId" params={{ candidateId: session.candidate_id }}>
            <BrainCircuit className="size-4" /> Feed into Digital Twin
          </Link>
        </Button>
        <Button variant="ghost" className="gap-2" onClick={onChange}>
          Refresh
        </Button>
      </div>
    </div>
  );
}

function Detail({ title, body }: { title: string; body?: string }) {
  if (!body) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-foreground/85">{body}</p>
    </div>
  );
}

function ListBlock({
  title,
  items,
  tone = "neutral",
}: {
  title: string;
  items?: string[];
  tone?: "neutral" | "success" | "warning";
}) {
  if (!items?.length) return null;
  const dot = tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-primary";
  return (
    <div>
      <p className="mb-1.5 text-[11px] tracking-[0.16em] text-muted-foreground uppercase">{title}</p>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i} className="flex gap-2 text-xs leading-relaxed text-foreground/85">
            <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${dot}`} />
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}
