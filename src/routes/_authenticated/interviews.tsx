import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarClock, CalendarPlus, Loader2, MessageSquareQuote, Sparkles, Video, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState, LoadingPanel, PageHeader, Pill, humanise } from "@/components/ui-kit";
import { errorMessage, recordAudit } from "@/lib/audit";
import { useAuth } from "@/lib/use-auth";
import { generateQuestions, summarizeFeedback } from "@/lib/agents.functions";

export const Route = createFileRoute("/_authenticated/interviews")({
  head: () => ({
    meta: [
      { title: "Interviews — HireFlow AI" },
      { name: "description", content: "Schedule interview rounds, generate tailored question guides and capture structured feedback." },
      { property: "og:title", content: "Interviews — HireFlow AI" },
      { property: "og:description", content: "Multi-round scheduling with AI-generated interview guides." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InterviewsPage,
});

function InterviewsPage() {
  const qc = useQueryClient();
  const { canWrite } = useAuth();
  const [scheduling, setScheduling] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["interviews"],
    queryFn: async () => {
      const [ivs, apps] = await Promise.all([
        supabase
          .from("interviews")
          .select("*, application:applications(id, stage, job:jobs(id,title,interview_rounds), candidate:candidates(full_name,email))")
          .order("scheduled_at", { ascending: true, nullsFirst: false }),
        supabase
          .from("applications")
          .select("id, stage, status, job:jobs(id,title,interview_rounds), candidate:candidates(full_name)")
          .in("stage", ["shortlisted", "interviewing", "offer"]),
      ]);
      if (ivs.error) throw new Error(ivs.error.message);
      if (apps.error) throw new Error(apps.error.message);
      return { interviews: ivs.data ?? [], apps: apps.data ?? [] };
    },
  });

  const upcoming = (data?.interviews ?? []).filter((i: any) => i.status === "scheduled");
  const past = (data?.interviews ?? []).filter((i: any) => i.status !== "scheduled");

  return (
    <>
      <PageHeader
        eyebrow="Loop"
        title="Interview scheduler"
        description="Rounds are created only for candidates a human has shortlisted. Each round gets a question guide generated from the job description and that specific resume."
        actions={
          canWrite ? (
            <button
              onClick={() => setScheduling(true)}
              disabled={!(data?.apps ?? []).length}
              className="focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
            >
              <CalendarPlus className="size-4" />
              Schedule round
            </button>
          ) : null
        }
      />

      {isLoading ? (
        <LoadingPanel rows={5} label="Loading interviews…" />
      ) : (data?.interviews ?? []).length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="size-6" />}
          title="No interviews scheduled"
          description={
            (data?.apps ?? []).length
              ? "Schedule a round for one of your shortlisted candidates to generate a tailored question guide."
              : "Approve a candidate in a job pipeline first — only shortlisted candidates can be scheduled."
          }
        />
      ) : (
        <div className="space-y-8">
          <Section title="Upcoming" rows={upcoming} onOpen={setDetail} />
          <Section title="Completed" rows={past} onOpen={setDetail} />
        </div>
      )}

      {scheduling ? (
        <ScheduleDialog
          apps={data?.apps ?? []}
          existing={data?.interviews ?? []}
          onClose={() => setScheduling(false)}
          onDone={() => {
            setScheduling(false);
            qc.invalidateQueries({ queryKey: ["interviews"] });
            qc.invalidateQueries({ queryKey: ["dashboard"] });
          }}
        />
      ) : null}

      {detail ? (
        <InterviewDrawer
          interview={detail}
          canWrite={canWrite}
          onClose={() => setDetail(null)}
          onChanged={(next) => {
            setDetail(next);
            qc.invalidateQueries({ queryKey: ["interviews"] });
          }}
        />
      ) : null}
    </>
  );
}

function Section({ title, rows, onOpen }: { title: string; rows: any[]; onOpen: (i: any) => void }) {
  if (!rows.length) return null;
  return (
    <section className="panel overflow-hidden">
      <div className="hairline px-5 py-4">
        <h2 className="font-display text-sm font-semibold">
          {title} ({rows.length})
        </h2>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((iv) => (
          <li key={iv.id} className="flex flex-wrap items-center gap-4 px-5 py-4 hover:bg-surface-2/50">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 font-mono text-sm text-primary">
              R{iv.round_number}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{iv.application?.candidate?.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {iv.round_name} · {iv.application?.job?.title} · {iv.duration_minutes} min
                {iv.interviewer_name ? ` · ${iv.interviewer_name}` : ""}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {iv.scheduled_at ? new Date(iv.scheduled_at).toLocaleString() : "Unscheduled"}
            </span>
            <Pill tone={iv.status === "completed" ? "success" : iv.status === "cancelled" ? "danger" : "accent"}>
              {humanise(iv.status)}
            </Pill>
            <button onClick={() => onOpen(iv)} className="focus-ring rounded-lg bg-secondary px-3 py-2 text-xs font-medium hover:bg-surface-2">
              Open
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScheduleDialog({
  apps,
  existing,
  onClose,
  onDone,
}: {
  apps: any[];
  existing: any[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [applicationId, setApplicationId] = useState(apps[0]?.id ?? "");
  const [roundName, setRoundName] = useState("Technical screen");
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState("45");
  const [interviewer, setInterviewer] = useState("");
  const [link, setLink] = useState("");

  const app = apps.find((a) => a.id === applicationId);
  const nextRound =
    Math.max(0, ...existing.filter((i) => i.application_id === applicationId).map((i) => i.round_number)) + 1;

  const save = useMutation({
    mutationFn: async () => {
      if (!applicationId) throw new Error("Pick a candidate.");
      if (!when) throw new Error("Pick a date and time.");
      const { data: userRes } = await supabase.auth.getUser();
      const { data: iv, error } = await supabase
        .from("interviews")
        .insert({
          application_id: applicationId,
          round_number: nextRound,
          round_name: roundName.trim() || `Round ${nextRound}`,
          scheduled_at: new Date(when).toISOString(),
          duration_minutes: Number(duration) || 45,
          interviewer_name: interviewer.trim() || null,
          meeting_link: link.trim() || `https://meet.hireflow.app/${crypto.randomUUID().slice(0, 8)}`,
          created_by: userRes.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      await supabase.from("applications").update({ stage: "interviewing" }).eq("id", applicationId);
      await recordAudit({
        action: "interview.schedule",
        entity_type: "interview",
        entity_id: iv.id,
        job_id: app?.job?.id ?? null,
        summary: `Scheduled ${roundName} (round ${nextRound}) for ${app?.candidate?.full_name} on ${new Date(when).toLocaleString()}.`,
      });

      try {
        await generateQuestions({ data: { interviewId: iv.id } });
      } catch (e) {
        console.error(e);
        toast.warning("Interview created, but question generation failed. You can retry from the round.");
      }
    },
    onSuccess: () => {
      toast.success("Round scheduled with a tailored question guide");
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm">
      <div className="glass-panel rise-in w-full max-w-lg rounded-2xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Schedule interview round</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              This will be round {nextRound} for the selected candidate.
            </p>
          </div>
          <button onClick={onClose} className="focus-ring rounded-md p-2" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="cand" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Candidate
            </label>
            <select
              id="cand"
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
              className="focus-ring w-full rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm outline-none"
            >
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.candidate?.full_name} — {a.job?.title}
                </option>
              ))}
            </select>
          </div>
          <TextField label="Round name" value={roundName} onChange={setRoundName} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Date & time" type="datetime-local" value={when} onChange={setWhen} />
            <TextField label="Duration (minutes)" type="number" value={duration} onChange={setDuration} />
          </div>
          <TextField label="Interviewer" value={interviewer} onChange={setInterviewer} placeholder="Optional" />
          <TextField label="Meeting link" value={link} onChange={setLink} placeholder="Leave blank to auto-generate" />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="focus-ring rounded-xl border border-border px-4 py-2.5 text-sm">
            Cancel
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
            style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}
            Schedule & generate guide
          </button>
        </div>
      </div>
    </div>
  );
}

function InterviewDrawer({
  interview,
  canWrite,
  onClose,
  onChanged,
}: {
  interview: any;
  canWrite: boolean;
  onClose: () => void;
  onChanged: (next: any) => void;
}) {
  const [notes, setNotes] = useState(interview.feedback_notes ?? "");
  const [rating, setRating] = useState(String(interview.feedback_rating ?? ""));
  const [working, setWorking] = useState<string | null>(null);
  const questions: any[] = Array.isArray(interview.questions) ? interview.questions : [];

  const refresh = async () => {
    const { data } = await supabase
      .from("interviews")
      .select("*, application:applications(id, stage, job:jobs(id,title), candidate:candidates(full_name,email))")
      .eq("id", interview.id)
      .maybeSingle();
    if (data) onChanged(data);
  };

  const regenerate = async () => {
    setWorking("questions");
    try {
      await generateQuestions({ data: { interviewId: interview.id } });
      await refresh();
      toast.success("Question guide regenerated");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setWorking(null);
    }
  };

  const saveFeedback = async () => {
    setWorking("feedback");
    try {
      const { error } = await supabase
        .from("interviews")
        .update({ feedback_notes: notes, feedback_rating: rating ? Number(rating) : null })
        .eq("id", interview.id);
      if (error) throw new Error(error.message);
      await recordAudit({
        action: "interview.feedback",
        entity_type: "interview",
        entity_id: interview.id,
        job_id: interview.application?.job?.id ?? null,
        summary: `Recorded feedback for ${interview.round_name} — ${interview.application?.candidate?.full_name} (${rating || "no"} rating).`,
      });
      await refresh();
      toast.success("Feedback saved");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setWorking(null);
    }
  };

  const summarise = async () => {
    setWorking("summary");
    try {
      await summarizeFeedback({ data: { interviewId: interview.id } });
      await refresh();
      toast.success("Feedback summarised");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <aside className="glass-panel h-full w-full max-w-xl overflow-y-auto rounded-l-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">
              Round {interview.round_number} · {interview.round_name}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {interview.application?.candidate?.full_name} · {interview.application?.job?.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {interview.scheduled_at ? new Date(interview.scheduled_at).toLocaleString() : "Unscheduled"} ·{" "}
              {interview.duration_minutes} min
            </p>
          </div>
          <button onClick={onClose} className="focus-ring rounded-md p-2" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        {interview.meeting_link ? (
          <a
            href={interview.meeting_link}
            target="_blank"
            rel="noreferrer noopener"
            className="focus-ring mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-accent hover:border-accent/50"
          >
            <Video className="size-3.5" />
            {interview.meeting_link}
          </a>
        ) : null}

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
              <Sparkles className="size-4 text-primary" />
              Tailored question guide
            </h3>
            {canWrite ? (
              <button
                onClick={regenerate}
                disabled={working === "questions"}
                className="focus-ring rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-60"
              >
                {working === "questions" ? "Generating…" : "Regenerate"}
              </button>
            ) : null}
          </div>
          {questions.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No questions generated yet.</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {questions.map((q, i) => (
                <li key={i} className="rounded-xl border border-border bg-surface-2/50 p-3">
                  <p className="text-sm font-medium">
                    {i + 1}. {q.question}
                  </p>
                  <p className="mt-1.5 text-[11px] uppercase tracking-wider text-accent">{q.competency}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Why this candidate: {q.why}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Strong signal: {q.signal}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="mt-8">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
            <MessageSquareQuote className="size-4 text-accent" />
            Interviewer feedback
          </h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            disabled={!canWrite}
            placeholder="What did you observe? Evidence, examples, concerns…"
            className="focus-ring mt-3 w-full resize-y rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/50"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              disabled={!canWrite}
              aria-label="Rating"
              className="focus-ring rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm outline-none"
            >
              <option value="">No rating</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} / 5
                </option>
              ))}
            </select>
            {canWrite ? (
              <>
                <button
                  onClick={saveFeedback}
                  disabled={working === "feedback"}
                  className="focus-ring rounded-xl border border-border px-4 py-2.5 text-sm disabled:opacity-60"
                >
                  Save feedback
                </button>
                <button
                  onClick={summarise}
                  disabled={working === "summary"}
                  className="focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                  style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
                >
                  {working === "summary" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  Summarise & complete
                </button>
              </>
            ) : null}
          </div>
          {interview.feedback_summary ? (
            <div className="mt-4 rounded-xl border border-border bg-surface-2/50 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">Decision brief</h4>
              <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {interview.feedback_summary}
              </pre>
            </div>
          ) : null}
        </section>
      </aside>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring w-full rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/50"
      />
    </div>
  );
}
