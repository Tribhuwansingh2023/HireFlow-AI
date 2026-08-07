import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleSlash,
  FileUp,
  Loader2,
  Mail,
  RefreshCcw,
  ScrollText,
  Shield,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  EmptyState,
  InlineAlert,
  LoadingPanel,
  PageHeader,
  Pill,
  ScoreRing,
  STAGE_TONE,
  STATUS_TONE,
  humanise,
} from "@/components/ui-kit";
import { errorMessage, recordAudit } from "@/lib/audit";
import { useAuth } from "@/lib/use-auth";
import { ACCEPTED_RESUME_TYPES, extractResumeText } from "@/lib/resume-extract";
import { parseResume, screenApplication, draftEmail } from "@/lib/agents.functions";
import { JobEditor, JobVersionHistory } from "@/components/job-editor";


export const Route = createFileRoute("/_authenticated/jobs/$jobId")({
  head: () => ({
    meta: [
      { title: "Pipeline — HireFlow AI" },
      { name: "description", content: "Upload resumes, review explainable AI screening and approve candidates." },
      { property: "og:title", content: "Pipeline — HireFlow AI" },
      { property: "og:description", content: "Explainable candidate screening with human approval gates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JobPipeline,
});

type UploadRow = { name: string; stage: string; status: "working" | "done" | "error"; detail?: string };

function JobPipeline() {
  const { jobId } = Route.useParams();
  const qc = useQueryClient();
  const { canWrite } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [openApp, setOpenApp] = useState<any | null>(null);
  const [editing, setEditing] = useState(false);


  const { data, isLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const [job, apps] = await Promise.all([
        supabase.from("jobs").select("*").eq("id", jobId).maybeSingle(),
        supabase
          .from("applications")
          .select("*, candidate:candidates(*)")
          .eq("job_id", jobId)
          .order("match_score", { ascending: false, nullsFirst: false }),
      ]);
      if (job.error) throw new Error(job.error.message);
      if (apps.error) throw new Error(apps.error.message);
      return { job: job.data, apps: apps.data ?? [] };
    },
  });

  const setRow = (name: string, patch: Partial<UploadRow>) =>
    setUploads((rows) => rows.map((r) => (r.name === name ? { ...r, ...patch } : r)));

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || !data?.job) return;
    setBusy(true);
    setUploads(Array.from(files).map((f) => ({ name: f.name, stage: "Queued", status: "working" as const })));

    for (const file of Array.from(files)) {
      try {
        setRow(file.name, { stage: "Extracting text" });
        const extracted = await extractResumeText(file, (stage) => setRow(file.name, { stage }));

        setRow(file.name, { stage: "Parsing profile with AI" });
        const { profile, embedding } = await parseResume({
          data: { text: extracted.text, fileName: file.name },
        });

        setRow(file.name, { stage: "Storing resume" });
        const { data: userRes } = await supabase.auth.getUser();
        const uid = userRes.user?.id ?? "anon";
        const path = `${uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
        const up = await supabase.storage.from("resumes").upload(path, file, { upsert: false });
        if (up.error) console.error(up.error);

        const dedupe = (profile.email || profile.full_name).toLowerCase().trim();
        const { data: existing } = await supabase
          .from("candidates")
          .select("id")
          .eq("dedupe_key", dedupe)
          .maybeSingle();

        const candidatePayload = {
          full_name: profile.full_name,
          email: profile.email || null,
          phone: profile.phone || null,
          location: profile.location || null,
          headline: profile.headline || null,
          years_experience: profile.years_experience,
          skills: profile.skills,
          education: profile.education as unknown as never,
          work_history: profile.work_history as unknown as never,
          links: profile.links as unknown as never,
          resume_text: extracted.text.slice(0, 100000),
          resume_file_name: file.name,
          resume_storage_path: up.error ? null : path,
          ocr_used: extracted.ocrUsed,
          dedupe_key: dedupe,
          embedding: (embedding.length ? embedding : null) as unknown as never,
          created_by: uid,
        };

        let candidateId = existing?.id;
        if (candidateId) {
          const { error } = await supabase.from("candidates").update(candidatePayload).eq("id", candidateId);
          if (error) throw new Error(error.message);
        } else {
          const { data: ins, error } = await supabase
            .from("candidates")
            .insert(candidatePayload)
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          candidateId = ins.id;
        }

        const { data: app, error: appErr } = await supabase
          .from("applications")
          .upsert({ job_id: jobId, candidate_id: candidateId! }, { onConflict: "job_id,candidate_id" })
          .select("id")
          .single();
        if (appErr) throw new Error(appErr.message);

        await recordAudit({
          action: "resume.ingest",
          entity_type: "candidate",
          entity_id: candidateId!,
          job_id: jobId,
          summary: `Ingested resume “${file.name}” for ${profile.full_name}${extracted.ocrUsed ? " (OCR used)" : ""}.`,
          details: { pages: extracted.pages, ocr: extracted.ocrUsed },
        });

        setRow(file.name, { stage: "Screening agent scoring" });
        const result = await screenApplication({ data: { applicationId: app.id } });
        setRow(file.name, {
          stage: `Scored ${result.score}/100 · ${result.recommendation}`,
          status: "done",
        });
      } catch (error) {
        setRow(file.name, { stage: errorMessage(error), status: "error" });
      }
    }

    setBusy(false);
    qc.invalidateQueries({ queryKey: ["job", jobId] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    toast.success("Resume processing finished");
  };

  const decide = useMutation({
    mutationFn: async ({ app, decision }: { app: any; decision: "approved" | "rejected" }) => {
      const stage = decision === "approved" ? "shortlisted" : "rejected";
      const { error } = await supabase
        .from("applications")
        .update({ status: decision, stage })
        .eq("id", app.id);
      if (error) throw new Error(error.message);

      const { error: apErr } = await supabase.from("approvals").insert({
        application_id: app.id,
        entity_type: "application",
        entity_id: app.id,
        decision,
        previous_value: { stage: app.stage, status: app.status } as never,
        new_value: { stage, status: decision } as never,
        comment: `Human ${decision} the agent recommendation “${app.ai_recommendation ?? "n/a"}”.`,
      });
      if (apErr) throw new Error(apErr.message);

      await recordAudit({
        action: `application.${decision}`,
        entity_type: "application",
        entity_id: app.id,
        job_id: jobId,
        summary: `${decision === "approved" ? "Approved" : "Rejected"} ${app.candidate?.full_name} — agent had recommended “${app.ai_recommendation ?? "n/a"}” at ${app.match_score ?? "?"}/100.`,
        details: { decision, agent_recommendation: app.ai_recommendation },
      });
    },
    onSuccess: () => {
      toast.success("Decision recorded and audited");
      setOpenApp(null);
      qc.invalidateQueries({ queryKey: ["job", jobId] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const rescreen = useMutation({
    mutationFn: async (appId: string) => screenApplication({ data: { applicationId: appId } }),
    onSuccess: (r) => {
      toast.success(`Re-screened — ${r.score}/100 (${r.recommendation})`);
      qc.invalidateQueries({ queryKey: ["job", jobId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const email = useMutation({
    mutationFn: async ({ appId, kind }: { appId: string; kind: string }) =>
      draftEmail({ data: { applicationId: appId, kind } }),
    onSuccess: () => {
      toast.success("Draft created — review it under Emails before sending");
      qc.invalidateQueries({ queryKey: ["emails"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading) return <LoadingPanel rows={6} label="Loading pipeline…" />;
  if (!data?.job) {
    return <EmptyState icon={<CircleSlash className="size-6" />} title="Job not found" description="It may have been deleted." />;
  }

  const job = data.job;
  const apps = data.apps;

  return (
    <>
      <Link to="/jobs" className="focus-ring mb-4 inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        All job posts
      </Link>

      <PageHeader
        eyebrow={[job.department, job.location].filter(Boolean).join(" · ") || "Requisition"}
        title={job.title}
        description={`Screening rubric: ${(job.required_skills ?? []).join(", ") || "no required skills set"} · minimum ${job.min_experience_years} years · ${job.interview_rounds} interview rounds.`}
        actions={
          canWrite ? (
            <>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={ACCEPTED_RESUME_TYPES}
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => setEditing(true)}
                className="focus-ring rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-surface-2"
              >
                Edit job post
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                Upload resumes
              </button>
            </>
          ) : null
        }
      />

      {editing ? <JobEditor job={job} onClose={() => setEditing(false)} /> : null}

      <div className="mb-6">
        <JobVersionHistory jobId={job.id} currentVersion={Number((job as any).current_version ?? 1)} />
      </div>


      {uploads.length > 0 ? (
        <div className="panel mb-6 p-5">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
            <FileUp className="size-4 text-accent" />
            Ingestion pipeline
          </h2>
          <ul className="mt-3 space-y-2">
            {uploads.map((u) => (
              <li key={u.name} className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs">
                {u.status === "working" ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                ) : u.status === "done" ? (
                  <CheckCircle2 className="size-3.5 shrink-0 text-success" />
                ) : (
                  <CircleSlash className="size-3.5 shrink-0 text-destructive" />
                )}
                <span className="min-w-0 flex-1 truncate font-mono">{u.name}</span>
                <span className={u.status === "error" ? "text-destructive" : "text-muted-foreground"}>{u.stage}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {apps.length === 0 ? (
        <EmptyState
          icon={<UploadCloud className="size-6" />}
          title="No candidates yet"
          description="Upload PDF, DOCX, TXT or scanned resumes. Text is extracted in your browser (with OCR fallback), parsed into a structured profile, then scored against this role."
          {...(canWrite
            ? {
                action: (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
                    style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
                  >
                    <UploadCloud className="size-4" />
                    Upload resumes
                  </button>
                ),
              }
            : {})}
        />
      ) : (
        <div className="panel overflow-hidden">
          <div className="hairline flex items-center justify-between px-5 py-4">
            <h2 className="font-display text-sm font-semibold">Ranked candidates ({apps.length})</h2>
            <Pill tone="neutral">Ordered by explainable match score</Pill>
          </div>
          <ul className="divide-y divide-border">
            {apps.map((app: any) => (
              <li key={app.id} className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2/50">
                <ScoreRing score={app.match_score} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{app.candidate?.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {app.candidate?.headline || "—"} · {app.candidate?.years_experience ?? 0}y
                    {app.candidate?.ocr_used ? " · OCR" : ""}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(app.matched_skills ?? []).slice(0, 4).map((s: string) => (
                      <span key={s} className="rounded bg-success/12 px-1.5 py-0.5 text-[10px] text-success">
                        {s}
                      </span>
                    ))}
                    {(app.missing_skills ?? []).slice(0, 3).map((s: string) => (
                      <span key={s} className="rounded bg-destructive/12 px-1.5 py-0.5 text-[10px] text-destructive">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={STAGE_TONE[app.stage] ?? "neutral"}>{humanise(app.stage)}</Pill>
                  <Pill tone={STATUS_TONE[app.status] ?? "neutral"}>{humanise(app.status)}</Pill>
                  <button
                    onClick={() => setOpenApp(app)}
                    className="focus-ring rounded-lg bg-secondary px-3 py-2 text-xs font-medium hover:bg-surface-2"
                  >
                    Review
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {openApp ? (
        <ReviewDrawer
          app={openApp}
          canWrite={canWrite}
          onClose={() => setOpenApp(null)}
          onDecide={(decision) => decide.mutate({ app: openApp, decision })}
          deciding={decide.isPending}
          onRescreen={() => rescreen.mutate(openApp.id)}
          rescreening={rescreen.isPending}
          onEmail={(kind) => email.mutate({ appId: openApp.id, kind })}
          emailing={email.isPending}
        />
      ) : null}
    </>
  );
}

function ReviewDrawer({
  app,
  canWrite,
  onClose,
  onDecide,
  deciding,
  onRescreen,
  rescreening,
  onEmail,
  emailing,
}: {
  app: any;
  canWrite: boolean;
  onClose: () => void;
  onDecide: (d: "approved" | "rejected") => void;
  deciding: boolean;
  onRescreen: () => void;
  rescreening: boolean;
  onEmail: (kind: string) => void;
  emailing: boolean;
}) {
  const breakdown = app.score_breakdown ?? {};
  const components: any[] = breakdown.components ?? [];
  const bias = app.bias_notes ?? {};

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="glass-panel h-full w-full max-w-xl overflow-y-auto rounded-l-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <ScoreRing score={app.match_score} size={64} />
            <div>
              <h2 className="font-display text-lg font-semibold">{app.candidate?.full_name}</h2>
              <p className="text-xs text-muted-foreground">{app.candidate?.headline || "—"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {app.candidate?.email || "no email"} · {app.candidate?.location || "location unknown"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="focus-ring rounded-md p-2" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Pill tone={STAGE_TONE[app.stage] ?? "neutral"}>{humanise(app.stage)}</Pill>
          <Pill tone={STATUS_TONE[app.status] ?? "neutral"}>{humanise(app.status)}</Pill>
          {app.ai_recommendation ? (
            <Pill tone={app.ai_recommendation === "advance" ? "success" : app.ai_recommendation === "reject" ? "danger" : "warning"}>
              Agent: {app.ai_recommendation}
            </Pill>
          ) : null}
          {app.ai_confidence != null ? (
            <Pill tone="neutral">Confidence {Math.round(app.ai_confidence * 100)}%</Pill>
          ) : null}
        </div>

        {app.ai_summary ? (
          <section className="mt-6">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
              <Sparkles className="size-4 text-primary" />
              Agent assessment
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{app.ai_summary}</p>
          </section>
        ) : (
          <div className="mt-6">
            <InlineAlert tone="warning" title="Not screened yet">
              Run the screening agent to generate an explainable score for this candidate.
            </InlineAlert>
          </div>
        )}

        {components.length ? (
          <section className="mt-6">
            <h3 className="font-display text-sm font-semibold">Why this score</h3>
            <p className="mt-1 text-xs text-muted-foreground">{breakdown.method}</p>
            <ul className="mt-3 space-y-3">
              {components.map((c) => (
                <li key={c.key} className="rounded-xl border border-border bg-surface-2/50 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{c.label}</span>
                    <span className="font-mono text-muted-foreground">
                      {c.score}/100 · weight {Math.round(c.weight * 100)}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${c.score}%`, backgroundImage: "var(--gradient-primary)" }} />
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{c.rationale}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {(breakdown.strengths ?? []).length || (breakdown.risks ?? []).length ? (
          <section className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-success">Strengths</h4>
              <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                {(breakdown.strengths ?? []).map((s: string, i: number) => (
                  <li key={i}>· {s}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-warning">Risks</h4>
              <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                {(breakdown.risks ?? []).map((s: string, i: number) => (
                  <li key={i}>· {s}</li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {bias.statement ? (
          <section className="mt-6 rounded-xl border border-border bg-surface-2/50 p-4">
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
              <Shield className="size-3.5" />
              Fairness controls
            </h4>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{bias.statement}</p>
            {(bias.excluded_attributes ?? []).length ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Excluded from scoring: {(bias.excluded_attributes ?? []).join(", ")}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="mt-6">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
            <ScrollText className="size-4 text-muted-foreground" />
            Resume extract
          </h3>
          <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {String(app.candidate?.resume_text ?? "").slice(0, 4000) || "No text extracted."}
          </pre>
        </section>

        {canWrite ? (
          <div className="sticky bottom-0 mt-8 -mx-6 border-t border-border bg-surface/90 px-6 py-4 backdrop-blur">
            <p className="mb-3 text-[11px] text-muted-foreground">
              Every decision here is written to the approvals ledger and the audit trail.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onDecide("approved")}
                disabled={deciding}
                className="focus-ring inline-flex items-center gap-2 rounded-xl bg-success/15 px-4 py-2.5 text-sm font-semibold text-success transition-colors hover:bg-success/25 disabled:opacity-60"
              >
                <CheckCircle2 className="size-4" />
                Approve & shortlist
              </button>
              <button
                onClick={() => onDecide("rejected")}
                disabled={deciding}
                className="focus-ring inline-flex items-center gap-2 rounded-xl bg-destructive/12 px-4 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-60"
              >
                <CircleSlash className="size-4" />
                Reject
              </button>
              <button
                onClick={onRescreen}
                disabled={rescreening}
                className="focus-ring inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm disabled:opacity-60"
              >
                {rescreening ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
                Re-screen
              </button>
              <button
                onClick={() => onEmail(app.stage === "rejected" ? "rejection" : "interview_invite")}
                disabled={emailing}
                className="focus-ring inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm disabled:opacity-60"
              >
                {emailing ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                Draft email
              </button>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
