import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gavel, Scale, Users2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState, LoadingPanel, PageHeader, Pill, StatCard } from "@/components/ui-kit";
import { AgentAvatar, VerdictBadge } from "@/components/debate-visuals";
import { COUNCIL, VERDICT_LABEL, type Verdict } from "@/lib/debate";
import { getCouncilAnalytics } from "@/lib/debate.functions";

export const Route = createFileRoute("/_authenticated/debate")({
  head: () => ({
    meta: [
      { title: "AI Recruiter Debate — HireFlow AI" },
      {
        name: "description",
        content:
          "An AI hiring council of ten specialist agents that independently evaluate, debate and vote on every candidate with full evidence and audit trail.",
      },
      { property: "og:title", content: "AI Recruiter Debate — HireFlow AI" },
      {
        property: "og:description",
        content: "Multi-agent hiring decisions that are transparent, explainable and auditable.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DebateIndex,
});

function DebateIndex() {
  const analyticsFn = useServerFn(getCouncilAnalytics);

  const { data, isLoading } = useQuery({
    queryKey: ["debate-index"],
    queryFn: async () => {
      const [{ data: candidates, error }, { data: debates, error: dErr }] = await Promise.all([
        supabase
          .from("candidates")
          .select("id, full_name, headline, years_experience, location, skills")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("debates")
          .select("id,candidate_ids,recommendation,consensus,confidence,human_decision,is_simulation,created_at,title")
          .order("created_at", { ascending: false })
          .limit(80),
      ]);
      if (error) throw new Error(error.message);
      if (dErr) throw new Error(dErr.message);
      const latest = new Map<string, any>();
      for (const d of debates ?? []) {
        if (d.is_simulation) continue;
        for (const id of d.candidate_ids ?? []) if (!latest.has(id)) latest.set(id, d);
      }
      return {
        candidates: (candidates ?? []).map((c) => ({ ...c, debate: latest.get(c.id) ?? null })),
        debates: debates ?? [],
      };
    },
  });

  const { data: analytics } = useQuery({ queryKey: ["council-analytics"], queryFn: () => analyticsFn({}) });

  return (
    <>
      <PageHeader
        eyebrow="Agentic decisioning"
        title="AI Recruiter Debate"
        description="Ten specialist agents evaluate each candidate independently, cross-examine each other's evidence, then vote. Every argument, disagreement and decision is stored, explainable and auditable."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Council sessions" value={analytics?.totals.debates ?? 0} icon={<Gavel className="size-4" />} />
        <StatCard label="Human decisions recorded" value={analytics?.totals.decided ?? 0} icon={<Users2 className="size-4" />} />
        <StatCard label="Average consensus" value={`${analytics?.totals.avgConsensus ?? 0}%`} icon={<Scale className="size-4" />} />
        <StatCard label="Human overrides" value={analytics?.totals.overrides ?? 0} icon={<Scale className="size-4" />} />
      </div>

      <section className="mt-8 rounded-2xl border border-border/70 bg-card/50 p-5 backdrop-blur">
        <h2 className="font-display text-lg font-semibold">The hiring council</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each agent owns one mandate, carries its own vote weight, and is measured against the decisions your team
          actually made.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {COUNCIL.map((agent) => {
            const stat = analytics?.agents.find((a) => a.agent === agent.key);
            return (
              <div key={agent.key} className="rounded-xl border border-border/60 bg-background/40 p-3.5">
                <div className="flex items-start gap-3">
                  <AgentAvatar agent={agent.key} size={34} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{agent.short}</p>
                    <p className="text-[11px] text-muted-foreground">Vote weight ×{agent.weight}</p>
                  </div>
                  {stat?.agreement !== null && stat?.agreement !== undefined ? (
                    <Pill tone={stat.agreement >= 70 ? "success" : stat.agreement >= 45 ? "warning" : "danger"} className="ml-auto">
                      {stat.agreement}% aligned
                    </Pill>
                  ) : null}
                </div>
                <p className="mt-2.5 line-clamp-2 text-xs text-muted-foreground">{agent.mandate}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {stat?.debates ?? 0} reviews · avg confidence {stat?.avgConfidence ?? 0}% · {stat?.challenges ?? 0}{" "}
                  challenges raised
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">Convene the council</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pick a candidate to open their boardroom.</p>

        {isLoading ? (
          <LoadingPanel rows={5} label="Loading talent pool" />
        ) : !data?.candidates.length ? (
          <EmptyState
            icon={<Users2 className="size-4" />}
            title="No candidates yet"
            description="Upload resumes against a job post and the council can start deliberating."
          />
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.candidates.map((c) => (
              <Link
                key={c.id}
                to="/debate/$candidateId"
                params={{ candidateId: c.id }}
                className="focus-ring group rounded-2xl border border-border/70 bg-card/50 p-4 backdrop-blur transition-colors hover:border-primary/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.headline ?? "No headline parsed"}</p>
                  </div>
                  {c.debate?.recommendation ? (
                    <VerdictBadge verdict={c.debate.recommendation as Verdict} />
                  ) : (
                    <Pill>Not deliberated</Pill>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(c.skills ?? []).slice(0, 4).map((s: string) => (
                    <span key={s} className="rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {s}
                    </span>
                  ))}
                </div>
                {c.debate ? (
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Consensus {c.debate.consensus}% · confidence {c.debate.confidence}%
                    {c.debate.human_decision ? ` · human: ${c.debate.human_decision}` : " · awaiting human decision"}
                  </p>
                ) : (
                  <p className="mt-3 text-[11px] text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Convene the council →
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {data?.debates.length ? (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold">Recent sessions</h2>
          <div className="mt-3 divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card/50">
            {data.debates.slice(0, 12).map((d) => (
              <Link
                key={d.id}
                to="/debate/$candidateId"
                params={{ candidateId: d.candidate_ids?.[0] ?? "" }}
                search={{ debate: d.id }}
                className="focus-ring flex flex-wrap items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/40"
              >
                <span className="min-w-0 flex-1 truncate">{d.title}</span>
                {d.is_simulation ? <Pill tone="accent">what-if</Pill> : null}
                {d.recommendation ? <VerdictBadge verdict={d.recommendation as Verdict} /> : null}
                <span className="text-xs text-muted-foreground tabular-nums">{d.consensus}% consensus</span>
                {d.human_decision ? <Pill tone="success">{VERDICT_LABEL[d.human_decision as Verdict] ?? d.human_decision}</Pill> : null}
                <span className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
