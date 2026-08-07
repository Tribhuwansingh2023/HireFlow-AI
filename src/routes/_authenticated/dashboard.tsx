import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Gavel,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  EmptyState,
  LoadingPanel,
  PageHeader,
  Pill,
  ScoreRing,
  StatCard,
  STAGE_TONE,
  humanise,
} from "@/components/ui-kit";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview — HireFlow AI" },
      { name: "description", content: "Live view of your hiring pipeline, approvals awaiting action and agent activity." },
      { property: "og:title", content: "Overview — HireFlow AI" },
      { property: "og:description", content: "Live hiring pipeline, pending approvals and agent activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const STAGES = ["screening", "shortlisted", "interviewing", "offer", "hired"] as const;

function Dashboard() {
  const { profile } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [jobs, apps, interviews, offers, audit] = await Promise.all([
        supabase.from("jobs").select("id,title,status,department,created_at").order("created_at", { ascending: false }),
        supabase
          .from("applications")
          .select("id,stage,status,match_score,ai_recommendation,created_at,job:jobs(id,title),candidate:candidates(full_name,headline)")
          .order("match_score", { ascending: false, nullsFirst: false }),
        supabase
          .from("interviews")
          .select("id,round_name,round_number,scheduled_at,status,application:applications(candidate:candidates(full_name),job:jobs(title))")
          .gte("scheduled_at", new Date(Date.now() - 3600_000).toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(5),
        supabase.from("offers").select("id,status,current_level,total_levels"),
        supabase
          .from("audit_events")
          .select("id,action,summary,actor_type,created_at")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
      const err = jobs.error || apps.error || interviews.error || offers.error || audit.error;
      if (err) throw new Error(err.message);
      return {
        jobs: jobs.data ?? [],
        apps: apps.data ?? [],
        interviews: interviews.data ?? [],
        offers: offers.data ?? [],
        audit: audit.data ?? [],
      };
    },
  });

  if (isLoading) {
    return (
      <>
        <PageHeader eyebrow="Workspace" title="Overview" description="Loading your pipeline…" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="panel shimmer h-32" />
          ))}
        </div>
        <div className="mt-6">
          <LoadingPanel rows={5} />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title="Overview" />
        <EmptyState
          icon={<TriangleAlert className="size-6" />}
          title="We couldn't load your workspace"
          description={error instanceof Error ? error.message : "Unexpected error."}
        />
      </>
    );
  }

  const apps = data?.apps ?? [];
  const openJobs = (data?.jobs ?? []).filter((j) => j.status === "open");
  const pending = apps.filter((a) => a.status === "pending_review");
  const hired = apps.filter((a) => a.stage === "hired");
  const isEmpty = (data?.jobs.length ?? 0) === 0;

  const funnel = STAGES.map((stage) => ({
    stage,
    count: apps.filter((a) => a.stage === stage).length,
  }));
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.count));

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title={`Welcome back${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
        description="Every agent action below is provisional until a human approves it. Approvals waiting on you are highlighted first."
        actions={
          <Link
            to="/jobs"
            className="focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
            style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
          >
            <Briefcase className="size-4" />
            Manage job posts
          </Link>
        }
      />

      {isEmpty ? (
        <EmptyState
          icon={<Sparkles className="size-6" />}
          title="Your workspace is ready"
          description="Create your first job post, then upload resumes to watch the screening agent rank candidates with an explainable breakdown."
          action={
            <Link
              to="/jobs"
              className="focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
              style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
            >
              Create a job post
              <ArrowRight className="size-4" />
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Open roles" value={openJobs.length} hint={`${data?.jobs.length ?? 0} total`} icon={<Briefcase className="size-4" />} tone="primary" />
            <StatCard label="Candidates in play" value={apps.length} hint={`${hired.length} hired`} icon={<Users className="size-4" />} tone="accent" />
            <StatCard label="Awaiting your approval" value={pending.length} hint="Human gate" icon={<CheckCircle2 className="size-4" />} tone={pending.length ? "warning" : "success"} />
            <StatCard label="Offers in approval" value={(data?.offers ?? []).filter((o) => o.status === "pending").length} hint={`${(data?.offers ?? []).length} total`} icon={<Gavel className="size-4" />} tone="default" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <section className="panel p-6 lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold">Hiring funnel</h2>
                <Link to="/analytics" className="focus-ring rounded text-xs text-primary hover:underline">
                  Full analytics →
                </Link>
              </div>
              <div className="mt-5 space-y-3">
                {funnel.map((f) => (
                  <div key={f.stage} className="flex items-center gap-4">
                    <span className="w-28 shrink-0 text-xs capitalize text-muted-foreground">{f.stage}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.max(2, (f.count / maxFunnel) * 100)}%`,
                          backgroundImage: "var(--gradient-primary)",
                        }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono text-xs tabular-nums">{f.count}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel p-6">
              <h2 className="font-display text-base font-semibold">Upcoming interviews</h2>
              {(data?.interviews ?? []).length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">Nothing scheduled yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {data?.interviews.map((iv: any) => (
                    <li key={iv.id} className="rounded-lg border border-border bg-surface-2/60 p-3">
                      <p className="text-sm font-medium">{iv.application?.candidate?.full_name ?? "Candidate"}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {iv.round_name} · {iv.application?.job?.title ?? ""}
                      </p>
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-accent">
                        <CalendarClock className="size-3" />
                        {iv.scheduled_at ? new Date(iv.scheduled_at).toLocaleString() : "Unscheduled"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/interviews" className="focus-ring mt-4 inline-block rounded text-xs text-primary hover:underline">
                Open scheduler →
              </Link>
            </section>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <section className="panel p-6 lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold">Top ranked candidates</h2>
                <Pill tone="warning">{pending.length} awaiting decision</Pill>
              </div>
              {apps.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">Upload resumes against a job to populate this list.</p>
              ) : (
                <ul className="mt-4 divide-y divide-border">
                  {apps.slice(0, 6).map((a: any) => (
                    <li key={a.id} className="flex items-center gap-4 py-3">
                      <ScoreRing score={a.match_score} size={48} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.candidate?.full_name ?? "Candidate"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {a.candidate?.headline || "—"} · {a.job?.title}
                        </p>
                      </div>
                      <Pill tone={STAGE_TONE[a.stage] ?? "neutral"}>{humanise(a.stage)}</Pill>
                      {a.job?.id ? (
                        <Link
                          to="/jobs/$jobId"
                          params={{ jobId: a.job.id }}
                          className="focus-ring rounded p-1.5 text-muted-foreground hover:text-primary"
                          aria-label="Open pipeline"
                        >
                          <ArrowRight className="size-4" />
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel p-6">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <Activity className="size-4 text-accent" />
                Recent activity
              </h2>
              <ul className="mt-4 space-y-3">
                {(data?.audit ?? []).map((ev) => (
                  <li key={ev.id} className="border-l-2 border-border pl-3">
                    <p className="text-xs leading-relaxed text-foreground">{ev.summary}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {ev.actor_type === "agent" ? "Agent" : "Human"} · {new Date(ev.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
                {(data?.audit ?? []).length === 0 ? (
                  <li className="text-sm text-muted-foreground">No activity recorded yet.</li>
                ) : null}
              </ul>
              <Link to="/audit" className="focus-ring mt-4 inline-block rounded text-xs text-primary hover:underline">
                Full audit trail →
              </Link>
            </section>
          </div>
        </>
      )}
    </>
  );
}
