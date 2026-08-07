import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState, LoadingPanel, PageHeader, StatCard } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — HireFlow AI" },
      { name: "description", content: "Funnel conversion, agent agreement rate and time-to-decision across your pipeline." },
      { property: "og:title", content: "Analytics — HireFlow AI" },
      { property: "og:description", content: "Pipeline conversion and AI-vs-human agreement analytics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

const STAGES = ["screening", "shortlisted", "interviewing", "offer", "hired", "rejected"] as const;

function AnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      const [apps, events, interviews] = await Promise.all([
        supabase.from("applications").select("id,stage,status,match_score,ai_recommendation,created_at,screened_at,job:jobs(title)"),
        supabase.from("audit_events").select("actor_type,action,created_at").limit(1000),
        supabase.from("interviews").select("feedback_rating,status"),
      ]);
      if (apps.error) throw new Error(apps.error.message);
      return { apps: apps.data ?? [], events: events.data ?? [], interviews: interviews.data ?? [] };
    },
  });

  if (isLoading) return <LoadingPanel rows={6} label="Crunching numbers…" />;

  const apps = data?.apps ?? [];
  if (!apps.length) {
    return (
      <>
        <PageHeader eyebrow="Insight" title="Analytics" />
        <EmptyState icon={<BarChart3 className="size-6" />} title="Not enough data yet" description="Screen a few candidates and the funnel, agreement rate and score distribution will populate here." />
      </>
    );
  }

  const scored = apps.filter((a) => a.match_score != null);
  const avgScore = scored.length ? Math.round(scored.reduce((s, a) => s + (a.match_score ?? 0), 0) / scored.length) : 0;
  const decided = apps.filter((a) => a.status === "approved" || a.status === "rejected");
  const agreed = decided.filter(
    (a) =>
      (a.status === "approved" && a.ai_recommendation === "advance") ||
      (a.status === "rejected" && a.ai_recommendation === "reject"),
  );
  const agreement = decided.length ? Math.round((agreed.length / decided.length) * 100) : 0;
  const agentEvents = (data?.events ?? []).filter((e) => e.actor_type === "agent").length;
  const humanEvents = (data?.events ?? []).length - agentEvents;

  const buckets = [
    ["0–39", 0, 39],
    ["40–59", 40, 59],
    ["60–74", 60, 74],
    ["75–84", 75, 84],
    ["85–100", 85, 100],
  ] as const;
  const dist = buckets.map(([label, lo, hi]) => ({
    label,
    count: scored.filter((a) => (a.match_score ?? 0) >= lo && (a.match_score ?? 0) <= hi).length,
  }));
  const maxDist = Math.max(1, ...dist.map((d) => d.count));

  const funnel = STAGES.map((s) => ({ stage: s, count: apps.filter((a) => a.stage === s).length }));
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.count));

  const byJob = Object.values(
    apps.reduce((acc: Record<string, { title: string; total: number; advanced: number }>, a: any) => {
      const title = a.job?.title ?? "Unassigned";
      acc[title] ??= { title, total: 0, advanced: 0 };
      acc[title].total += 1;
      if (["shortlisted", "interviewing", "offer", "hired"].includes(a.stage)) acc[title].advanced += 1;
      return acc;
    }, {}),
  );

  return (
    <>
      <PageHeader
        eyebrow="Insight"
        title="Pipeline analytics"
        description="The agreement rate is the honesty metric: how often a human confirmed the agent's recommendation. A very high number means the automation is calibrated; a low one means the rubric needs tuning."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Candidates screened" value={scored.length} hint={`${apps.length} total applications`} tone="primary" />
        <StatCard label="Average match score" value={`${avgScore}`} hint="across screened candidates" tone="accent" />
        <StatCard label="Human/agent agreement" value={`${agreement}%`} hint={`${decided.length} decisions reviewed`} tone={agreement >= 70 ? "success" : "warning"} />
        <StatCard label="Automated vs human steps" value={`${agentEvents}/${humanEvents}`} hint="audited events" tone="default" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-6">
          <h2 className="font-display text-base font-semibold">Stage distribution</h2>
          <div className="mt-5 space-y-3">
            {funnel.map((f) => (
              <div key={f.stage} className="flex items-center gap-4">
                <span className="w-28 shrink-0 text-xs capitalize text-muted-foreground">{f.stage}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, (f.count / maxFunnel) * 100)}%`, backgroundImage: "var(--gradient-primary)" }} />
                </div>
                <span className="w-8 text-right font-mono text-xs">{f.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel p-6">
          <h2 className="font-display text-base font-semibold">Match score distribution</h2>
          <div className="mt-5 flex h-44 items-end gap-3">
            {dist.map((d) => (
              <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{d.count}</span>
                <div
                  className="w-full rounded-t-lg transition-all"
                  style={{ height: `${(d.count / maxDist) * 100}%`, minHeight: 4, backgroundImage: "var(--gradient-primary)" }}
                />
                <span className="text-[11px] text-muted-foreground">{d.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel mt-6 overflow-hidden">
        <div className="hairline px-5 py-4">
          <h2 className="font-display text-sm font-semibold">Conversion by role</h2>
        </div>
        <ul className="divide-y divide-border">
          {byJob.map((j) => (
            <li key={j.title} className="flex items-center gap-4 px-5 py-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{j.title}</span>
              <span className="text-xs text-muted-foreground">
                {j.advanced}/{j.total} advanced
              </span>
              <span className="w-14 text-right font-mono text-xs text-primary">
                {Math.round((j.advanced / Math.max(1, j.total)) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
