import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BrainCircuit, GitCompare, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState, LoadingPanel, PageHeader, Pill } from "@/components/ui-kit";
import { ConfidenceChip } from "@/components/twin-visuals";

export const Route = createFileRoute("/_authenticated/twin")({
  head: () => ({
    meta: [
      { title: "AI Hiring Digital Twin — HireFlow AI" },
      {
        name: "description",
        content:
          "Predict future candidate success with an auditable AI Digital Twin: DNA scores, promotion path, retention, burnout and risk forecasts.",
      },
      { property: "og:title", content: "AI Hiring Digital Twin — HireFlow AI" },
      {
        property: "og:description",
        content: "Forecast candidate success with explainable, auditable AI predictions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TwinIndex,
});

function TwinIndex() {
  const { data, isLoading } = useQuery({
    queryKey: ["twin-index"],
    queryFn: async () => {
      const [{ data: candidates, error }, { data: twins, error: tErr }] = await Promise.all([
        supabase
          .from("candidates")
          .select("id, full_name, headline, years_experience, location, skills")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("candidate_twins")
          .select("candidate_id, version, overall_confidence, reliability, created_at, is_simulation")
          .eq("is_simulation", false)
          .order("created_at", { ascending: false }),
      ]);
      if (error) throw new Error(error.message);
      if (tErr) throw new Error(tErr.message);
      const latest = new Map<string, any>();
      for (const t of twins ?? []) if (!latest.has(t.candidate_id)) latest.set(t.candidate_id, t);
      return (candidates ?? []).map((c) => ({ ...c, twin: latest.get(c.id) ?? null }));
    },
  });

  return (
    <>
      <PageHeader
        eyebrow="Predictive intelligence"
        title="AI Hiring Digital Twin"
        actions={
          <Link to="/twin/compare" className="btn-ghost focus-ring">
            <GitCompare className="size-4" />
            Compare candidates
          </Link>
        }
        description="A calibrated model of every candidate's future: DNA dimensions, promotion path, retention, burnout, team chemistry and risk — each prediction carrying its own evidence, confidence and decision path."
      />

      {isLoading ? (
        <LoadingPanel rows={5} label="Loading talent pool…" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<BrainCircuit className="size-6" />}
          title="No candidates to model yet"
          description="Upload resumes to a job pipeline first — the Digital Twin builds its forecast from real screening, interview and communication evidence."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data?.map((c: any) => (
            <Link
              key={c.id}
              to="/twin/$candidateId"
              params={{ candidateId: c.id }}
              className="twin-card twin-card-hover focus-ring block p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-semibold">{c.full_name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {c.headline || "No headline parsed"}
                  </p>
                </div>
                {c.twin ? (
                  <Pill tone={c.twin.reliability === "high" ? "success" : c.twin.reliability === "low" ? "warning" : "accent"}>
                    v{c.twin.version}
                  </Pill>
                ) : (
                  <Pill tone="neutral">No twin</Pill>
                )}
              </div>

              <p className="mt-3 text-[11px] text-muted-foreground">
                {c.years_experience} yrs · {c.location || "location unknown"} · {(c.skills ?? []).length} skills
              </p>

              <div className="mt-4 flex items-center justify-between">
                {c.twin ? (
                  <ConfidenceChip value={Number(c.twin.overall_confidence)} />
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Sparkles className="size-3.5" />
                    Generate a forecast
                  </span>
                )}
                <span className="text-xs font-medium twin-gradient-text">Open twin →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
