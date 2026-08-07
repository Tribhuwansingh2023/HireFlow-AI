import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, CircleSlash, Download, FileText, Mail, MapPin, Phone } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  EmptyState,
  LoadingPanel,
  PageHeader,
  Pill,
  ScoreRing,
  STAGE_TONE,
  STATUS_TONE,
  humanise,
} from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/candidates_/$candidateId")({
  head: () => ({
    meta: [
      { title: "Candidate profile — HireFlow AI" },
      {
        name: "description",
        content: "Full candidate profile with inline resume viewer and an explainable score breakdown.",
      },
      { property: "og:title", content: "Candidate profile — HireFlow AI" },
      { property: "og:description", content: "Parsed profile, resume viewer and explainable scoring in one view." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CandidateDetail,
});

function CandidateDetail() {
  const { candidateId } = Route.useParams();
  const [tab, setTab] = useState<"document" | "text">("document");

  const { data, isLoading } = useQuery({
    queryKey: ["candidate", candidateId],
    queryFn: async () => {
      const [cand, apps] = await Promise.all([
        supabase.from("candidates").select("*").eq("id", candidateId).maybeSingle(),
        supabase
          .from("applications")
          .select("*, job:jobs(id, title, department, required_skills, nice_to_have_skills)")
          .eq("candidate_id", candidateId)
          .order("match_score", { ascending: false, nullsFirst: false }),
      ]);
      if (cand.error) throw new Error(cand.error.message);
      if (apps.error) throw new Error(apps.error.message);

      let resumeUrl: string | null = null;
      if (cand.data?.resume_storage_path) {
        const signed = await supabase.storage
          .from("resumes")
          .createSignedUrl(cand.data.resume_storage_path, 60 * 30);
        resumeUrl = signed.data?.signedUrl ?? null;
      }
      return { candidate: cand.data, apps: apps.data ?? [], resumeUrl };
    },
  });

  if (isLoading) return <LoadingPanel rows={6} label="Loading candidate…" />;
  if (!data?.candidate) {
    return (
      <EmptyState
        icon={<CircleSlash className="size-6" />}
        title="Candidate not found"
        description="This profile may have been removed from the talent pool."
      />
    );
  }

  const c: any = data.candidate;
  const education: any[] = Array.isArray(c.education) ? c.education : [];
  const work: any[] = Array.isArray(c.work_history) ? c.work_history : [];
  const links: Record<string, string> = c.links && typeof c.links === "object" ? c.links : {};
  const isPdf = /\.pdf$/i.test(String(c.resume_file_name ?? ""));

  return (
    <>
      <Link
        to="/candidates"
        className="focus-ring mb-4 inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Talent pool
      </Link>

      <Link
        to="/twin/$candidateId"
        params={{ candidateId }}
        className="focus-ring mb-4 ml-4 inline-flex items-center gap-1.5 rounded text-xs font-medium twin-gradient-text"
      >
        Open AI Digital Twin →
      </Link>



      <PageHeader
        eyebrow={c.headline || "Candidate"}
        title={c.full_name}
        description={`${c.years_experience ?? 0} years of experience · ${(c.skills ?? []).length} parsed skills · ingested from ${humanise(c.source ?? "upload")}${c.ocr_used ? " with OCR" : ""}.`}
        actions={
          data.resumeUrl ? (
            <a
              href={data.resumeUrl}
              target="_blank"
              rel="noreferrer"
              className="focus-ring inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm"
            >
              <Download className="size-4" />
              Download resume
            </a>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Resume viewer */}
        <section className="panel overflow-hidden">
          <div className="hairline flex flex-wrap items-center gap-2 px-5 py-3">
            <FileText className="size-4 text-primary" />
            <h2 className="font-display text-sm font-semibold">{c.resume_file_name || "Resume"}</h2>
            <div className="ml-auto flex gap-1">
              {(["document", "text"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`focus-ring rounded-lg px-3 py-1.5 text-xs font-medium ${
                    tab === t ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "document" ? "Document" : "Extracted text"}
                </button>
              ))}
            </div>
          </div>

          {tab === "document" && data.resumeUrl && isPdf ? (
            <iframe
              title={`Resume of ${c.full_name}`}
              src={data.resumeUrl}
              className="h-[720px] w-full border-0 bg-surface-2"
            />
          ) : tab === "document" && data.resumeUrl ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              This file type cannot be previewed inline.{" "}
              <a className="text-primary underline" href={data.resumeUrl} target="_blank" rel="noreferrer">
                Open the original document
              </a>
              , or switch to the extracted text.
            </div>
          ) : (
            <pre className="max-h-[720px] overflow-auto whitespace-pre-wrap px-5 py-4 font-mono text-xs leading-relaxed text-muted-foreground">
              {c.resume_text || "No text was extracted from this resume."}
            </pre>
          )}
        </section>

        {/* Extracted profile */}
        <aside className="space-y-6">
          <section className="panel p-5">
            <h2 className="font-display text-sm font-semibold">Extracted profile</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <Field icon={<Mail className="size-3.5" />} label="Email" value={c.email} />
              <Field icon={<Phone className="size-3.5" />} label="Phone" value={c.phone} />
              <Field icon={<MapPin className="size-3.5" />} label="Location" value={c.location} />
            </dl>

            <h3 className="mt-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Skills</h3>
            <div className="mt-2 flex flex-wrap gap-1">
              {(c.skills ?? []).length ? (
                (c.skills ?? []).map((s: string) => (
                  <span key={s} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">
                    {s}
                  </span>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No skills parsed.</p>
              )}
            </div>

            {Object.keys(links).length ? (
              <>
                <h3 className="mt-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Links</h3>
                <ul className="mt-2 space-y-1 text-xs">
                  {Object.entries(links)
                    .filter(([, v]) => !!v)
                    .map(([k, v]) => (
                      <li key={k} className="truncate">
                        <span className="text-muted-foreground">{humanise(k)}: </span>
                        <a href={String(v)} target="_blank" rel="noreferrer" className="text-primary underline">
                          {String(v)}
                        </a>
                      </li>
                    ))}
                </ul>
              </>
            ) : null}
          </section>

          <section className="panel p-5">
            <h2 className="font-display text-sm font-semibold">Experience</h2>
            {work.length ? (
              <ul className="mt-3 space-y-3">
                {work.map((w, i) => (
                  <li key={i} className="rounded-lg border border-border bg-surface-2/50 p-3">
                    <p className="text-sm font-medium">{w.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {w.company} · {w.period}
                    </p>
                    {w.highlights ? <p className="mt-1.5 text-xs leading-relaxed">{w.highlights}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">No structured work history parsed.</p>
            )}

            <h2 className="mt-5 font-display text-sm font-semibold">Education</h2>
            {education.length ? (
              <ul className="mt-3 space-y-2">
                {education.map((e, i) => (
                  <li key={i} className="text-xs">
                    <span className="font-medium">{e.degree}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      — {e.institution} {e.year ? `(${e.year})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">No education parsed.</p>
            )}
          </section>
        </aside>
      </div>

      {/* Explainable scoring per application */}
      <section className="mt-8">
        <h2 className="mb-3 font-display text-lg font-semibold">Scoring across {data.apps.length} application(s)</h2>
        {data.apps.length === 0 ? (
          <EmptyState
            icon={<CircleSlash className="size-6" />}
            title="Not attached to a role yet"
            description="Upload this resume from a job pipeline to generate an explainable score."
          />
        ) : (
          <div className="space-y-5">
            {data.apps.map((app: any) => (
              <ScorePanel key={app.id} app={app} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <dt className="sr-only">{label}</dt>
      <dd className="truncate text-sm">{value || <span className="text-muted-foreground">Not provided</span>}</dd>
    </div>
  );
}

function ScorePanel({ app }: { app: any }) {
  const breakdown = app.score_breakdown ?? {};
  const components: any[] = breakdown.components ?? [];
  const missing: string[] = app.missing_skills ?? [];
  const matched: string[] = app.matched_skills ?? [];
  const required: string[] = app.job?.required_skills ?? [];
  const coverage = required.length ? Math.round((matched.length / required.length) * 100) : null;

  return (
    <article className="panel p-6">
      <div className="flex flex-wrap items-center gap-4">
        <ScoreRing score={app.match_score} size={64} />
        <div className="min-w-0 flex-1">
          <Link
            to="/jobs/$jobId"
            params={{ jobId: app.job?.id }}
            className="focus-ring font-display text-base font-semibold hover:text-primary"
          >
            {app.job?.title}
          </Link>
          <p className="text-xs text-muted-foreground">
            {app.job?.department || "—"} · scored{" "}
            {app.screened_at ? new Date(app.screened_at).toLocaleString() : "not yet"}
            {app.job_version ? ` · against job description v${app.job_version}` : ""}
          </p>
        </div>
        <Pill tone={STAGE_TONE[app.stage] ?? "neutral"}>{humanise(app.stage)}</Pill>
        <Pill tone={STATUS_TONE[app.status] ?? "neutral"}>{humanise(app.status)}</Pill>
      </div>

      {app.ai_summary ? <p className="mt-4 text-sm leading-relaxed">{app.ai_summary}</p> : null}

      {components.length ? (
        <div className="mt-5 space-y-3">
          {components.map((c) => (
            <div key={c.key}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-medium">{c.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {c.score}/100 · weight {Math.round(c.weight * 100)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, Math.min(100, c.score))}%`,
                    backgroundImage: "var(--gradient-primary)",
                  }}
                />
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{c.rationale}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">This application has not been screened yet.</p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Matched requirements {coverage != null ? `(${coverage}% coverage)` : ""}
          </h3>
          <div className="mt-2 flex flex-wrap gap-1">
            {matched.length ? (
              matched.map((s) => (
                <span key={s} className="rounded bg-success/12 px-2 py-0.5 text-[11px] text-success">
                  {s}
                </span>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">None evidenced.</p>
            )}
          </div>
        </div>
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Missing requirements</h3>
          <div className="mt-2 flex flex-wrap gap-1">
            {missing.length ? (
              missing.map((s) => (
                <span
                  key={s}
                  className="rounded border border-destructive/40 bg-destructive/12 px-2 py-0.5 text-[11px] font-medium text-destructive"
                >
                  {s}
                </span>
              ))
            ) : (
              <p className="text-xs text-success">Every required skill is evidenced.</p>
            )}
          </div>
          {missing.length ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              These required skills were not found in the resume text or parsed skills — probe them in the interview
              before discounting the candidate.
            </p>
          ) : null}
        </div>
      </div>

      {breakdown.strengths?.length || breakdown.risks?.length ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <ul className="space-y-1 text-xs">
            {(breakdown.strengths ?? []).map((s: string, i: number) => (
              <li key={i} className="text-success">
                + {s}
              </li>
            ))}
          </ul>
          <ul className="space-y-1 text-xs">
            {(breakdown.risks ?? []).map((s: string, i: number) => (
              <li key={i} className="text-warning">
                ! {s}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {breakdown.method ? (
        <p className="mt-5 border-t border-border pt-3 text-[11px] text-muted-foreground">Method: {breakdown.method}</p>
      ) : null}
    </article>
  );
}
