/**
 * Multi-candidate Digital Twin comparison.
 *
 * Ranks every candidate that has a persisted (non-simulation) Digital Twin by a
 * chosen predictive metric and explains the differences side by side using the
 * stored rationale, evidence and confidence of each prediction.
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { BrainCircuit, ChevronDown, GitCompare, Trophy, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState, LoadingPanel, PageHeader, Pill } from "@/components/ui-kit";
import { ConfidenceChip, MetricBar, SectionTitle, clamp, toneFor } from "@/components/twin-visuals";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/twin_/compare")({
  validateSearch: (search: Record<string, unknown>) => ({
    ids: typeof search['ids'] === "string" ? (search['ids'] as string) : "",
    metric: typeof search['metric'] === "string" ? (search['metric'] as string) : "Long-Term Value",
  }),
  head: () => ({
    meta: [
      { title: "Compare Digital Twins — HireFlow AI" },
      {
        name: "description",
        content:
          "Rank candidates side by side on Digital Twin predictions — retention, promotion, burnout and DNA — with the evidence behind every difference.",
      },
      { property: "og:title", content: "Compare Digital Twins — HireFlow AI" },
      {
        property: "og:description",
        content: "Explainable multi-candidate ranking built on persisted AI Digital Twin forecasts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TwinCompare,
  errorComponent: ({ error }) => (
    <div role="alert" className="twin-card p-6 text-sm text-danger">
      {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="twin-card p-6 text-sm">No twins to compare.</div>,
});

const SERIES_COLORS = ["var(--twin-blue)", "var(--primary)", "var(--twin-violet)", "var(--twin-cyan)"];
const MAX_SELECTION = 4;

/** Metrics a recruiter can rank the pool by. `invert` = lower is better. */
const RANK_METRICS: Array<{ key: string; label: string; invert?: boolean; from: "prediction" | "derived" }> = [
  { key: "Long-Term Value", label: "Long-term value", from: "prediction" },
  { key: "Retention Probability", label: "Retention probability", from: "prediction" },
  { key: "Promotion Probability", label: "Promotion probability", from: "prediction" },
  { key: "Leadership Potential", label: "Leadership potential", from: "prediction" },
  { key: "Culture Fit", label: "Culture fit", from: "prediction" },
  { key: "Innovation Potential", label: "Innovation potential", from: "prediction" },
  { key: "Burnout Risk", label: "Burnout risk (lower is better)", invert: true, from: "prediction" },
  { key: "__dna", label: "Digital DNA average", from: "derived" },
  { key: "__confidence", label: "Model confidence", from: "derived" },
];

type TwinRow = {
  id: string;
  candidate_id: string;
  version: number;
  overall_confidence: number;
  reliability: string;
  created_at: string;
  dna: Array<{ dimension: string; score: number; confidence: number; rationale?: string }>;
  predictions: Array<{ key: string; value: number; confidence: number; reasoning?: string; evidence?: string[] }>;
  retention: { six_months?: number; one_year?: number; two_years?: number };
  burnout: { risk?: number; level?: string };
  salary: { market_value?: number; expected?: number; currency?: string; acceptance_probability?: number };
  risk: Array<{ factor: string; score: number; level: string; note?: string }>;
  recruiter_summary: string;
};

type Entry = {
  id: string;
  name: string;
  headline: string | null;
  years: number;
  twin: TwinRow;
};

const pred = (t: TwinRow, key: string) => (t.predictions ?? []).find((p) => p.key === key);

function dnaAverage(t: TwinRow) {
  const list = t.dna ?? [];
  if (!list.length) return 0;
  return Math.round(list.reduce((s, d) => s + clamp(d.score), 0) / list.length);
}

function metricValue(t: TwinRow, key: string): number {
  if (key === "__dna") return dnaAverage(t);
  if (key === "__confidence") return clamp(t.overall_confidence);
  return clamp(pred(t, key)?.value ?? 0);
}

function TwinCompare() {
  const { ids, metric } = Route.useSearch() as { ids: string; metric: string };
  const navigate = useNavigate();
  const [openRow, setOpenRow] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["twin-compare"],
    queryFn: async (): Promise<Entry[]> => {
      const [{ data: candidates, error }, { data: twins, error: tErr }] = await Promise.all([
        supabase
          .from("candidates")
          .select("id, full_name, headline, years_experience")
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("candidate_twins")
          .select("*")
          .eq("is_simulation", false)
          .order("created_at", { ascending: false })
          .limit(300),
      ]);
      if (error) throw new Error(error.message);
      if (tErr) throw new Error(tErr.message);

      const latest = new Map<string, TwinRow>();
      for (const t of (twins ?? []) as unknown as TwinRow[]) {
        if (!latest.has(t.candidate_id)) latest.set(t.candidate_id, t);
      }
      return (candidates ?? [])
        .filter((c) => latest.has(c.id))
        .map((c) => ({
          id: c.id,
          name: c.full_name,
          headline: c.headline,
          years: Number(c.years_experience ?? 0),
          twin: latest.get(c.id)!,
        }));
    },
  });

  const pool = data ?? [];
  const activeMetric = RANK_METRICS.find((m) => m.key === metric) ?? RANK_METRICS[0]!;

  const ranked = useMemo(() => {
    const list = [...pool].sort((a, b) => {
      const av = metricValue(a.twin, activeMetric.key);
      const bv = metricValue(b.twin, activeMetric.key);
      return activeMetric.invert ? av - bv : bv - av;
    });
    return list;
  }, [pool, activeMetric]);

  const selectedIds = useMemo(() => {
    const explicit = ids.split(",").map((s: string) => s.trim()).filter(Boolean).filter((id: string) => pool.some((p) => p.id === id));
    if (explicit.length) return explicit.slice(0, MAX_SELECTION);
    return ranked.slice(0, Math.min(3, ranked.length)).map((r) => r.id);
  }, [ids, pool, ranked]);

  const selected = selectedIds
    .map((id: string) => pool.find((p) => p.id === id))
    .filter((x: Entry | undefined): x is Entry => Boolean(x));

  const setSelection = (next: string[]) =>
    navigate({ to: "/twin/compare" as const, search: (prev: { ids: string; metric: string }) => ({ ...prev, ids: next.join(",") }), replace: true });

  const toggle = (id: string) => {
    const has = selectedIds.includes(id);
    if (has) {
      if (selectedIds.length <= 2) return;
      setSelection(selectedIds.filter((s: string) => s !== id));
    } else {
      setSelection([...selectedIds, id].slice(0, MAX_SELECTION));
    }
  };

  const dimensions = useMemo(() => {
    const set: string[] = [];
    for (const e of selected) for (const d of e.twin.dna ?? []) if (!set.includes(d.dimension)) set.push(d.dimension);
    return set;
  }, [selected]);

  const radarData = useMemo(
    () =>
      dimensions.map((dim) => {
        const row: Record<string, string | number> = { dimension: dim };
        for (const e of selected) {
          row[e.name] = clamp((e.twin.dna ?? []).find((d: TwinRow["dna"][number]) => d.dimension === dim)?.score ?? 0);
        }
        return row;
      }),
    [dimensions, selected],
  );

  const predictionKeys = useMemo(() => {
    const set: string[] = [];
    for (const e of selected) for (const p of e.twin.predictions ?? []) if (!set.includes(p.key)) set.push(p.key);
    return set;
  }, [selected]);

  /** Biggest explainable gaps between the leader and the rest of the shortlist. */
  const differentiators = useMemo(() => {
    if (selected.length < 2) return [];
    const leader = selected[0]!;
    const rows: Array<{
      key: string;
      leaderValue: number;
      spread: number;
      winner: string;
      loser: string;
      reasoning: string;
      counter: string;
    }> = [];
    for (const key of predictionKeys) {
      const values = selected
        .map((e) => ({ e, p: pred(e.twin, key) }))
        .filter((x) => x.p) as Array<{ e: Entry; p: NonNullable<ReturnType<typeof pred>> }>;
      if (values.length < 2) continue;
      const sorted = [...values].sort((a, b) => clamp(b.p.value) - clamp(a.p.value));
      const top = sorted[0]!;
      const bottom = sorted[sorted.length - 1]!;
      const spread = clamp(top.p.value) - clamp(bottom.p.value);
      if (spread < 5) continue;
      rows.push({
        key,
        leaderValue: clamp(pred(leader.twin, key)?.value ?? 0),
        spread,
        winner: top.e.name,
        loser: bottom.e.name,
        reasoning: top.p.reasoning ?? "No rationale recorded.",
        counter: bottom.p.reasoning ?? "No rationale recorded.",
      });
    }
    return rows.sort((a, b) => b.spread - a.spread).slice(0, 6);
  }, [selected, predictionKeys]);

  return (
    <>
      <PageHeader
        eyebrow="Predictive intelligence"
        title="Compare Digital Twins"
        description="Rank the shortlist on any predicted outcome, then read the exact reasoning, evidence and confidence behind every difference. Only persisted, non-simulated forecasts are compared."
        actions={
          <Link to="/twin" className="btn-ghost focus-ring">
            <BrainCircuit className="size-4" />
            All twins
          </Link>
        }
      />

      {isLoading ? (
        <LoadingPanel rows={5} label="Loading Digital Twin forecasts…" />
      ) : pool.length < 2 ? (
        <EmptyState
          icon={<GitCompare className="size-6" />}
          title="Not enough twins to compare"
          description="Generate a Digital Twin for at least two candidates — comparison uses persisted forecasts so every ranking stays reproducible and auditable."
        />
      ) : (
        <div className="mt-6 space-y-6">
          {/* Ranking controls */}
          <div className="twin-card p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <SectionTitle title="Rank the pool" description={`${pool.length} candidates with a persisted twin`} />
              </div>
              <label className="text-xs text-muted-foreground">
                <span className="mb-1.5 block">Ranking metric</span>
                <select
                  value={activeMetric.key}
                  onChange={(e) =>
                    navigate({
                      to: "/twin/compare" as const,
                      search: (prev: { ids: string; metric: string }) => ({ ...prev, metric: e.target.value }),
                      replace: true,
                    })
                  }
                  className="focus-ring w-64 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                >
                  {RANK_METRICS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">#</th>
                    <th className="py-2 pr-3 font-medium">Candidate</th>
                    <th className="py-2 pr-3 font-medium">{activeMetric.label}</th>
                    <th className="py-2 pr-3 font-medium">Δ vs leader</th>
                    <th className="py-2 pr-3 font-medium">DNA avg</th>
                    <th className="py-2 pr-3 font-medium">Confidence</th>
                    <th className="py-2 pr-3 font-medium">Compare</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((e, i) => {
                    const value = metricValue(e.twin, activeMetric.key);
                    const leaderValue = metricValue(ranked[0]!.twin, activeMetric.key);
                    const delta = value - leaderValue;
                    const active = selectedIds.includes(e.id);
                    return (
                      <tr key={e.id} className="border-t border-border/60">
                        <td className="py-2.5 pr-3 text-muted-foreground">
                          {i === 0 ? <Trophy className="size-4 text-primary" aria-label="Top ranked" /> : i + 1}
                        </td>
                        <td className="py-2.5 pr-3">
                          <Link
                            to="/twin/$candidateId"
                            params={{ candidateId: e.id }}
                            className="focus-ring font-medium hover:underline"
                          >
                            {e.name}
                          </Link>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {e.headline || `${e.years} yrs experience`}
                          </p>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className="font-display text-base font-semibold"
                            style={{ color: toneFor(value, activeMetric.invert) }}
                          >
                            {value}%
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                          {i === 0 ? "—" : `${delta > 0 ? "+" : ""}${delta} pts`}
                        </td>
                        <td className="py-2.5 pr-3 text-xs">{dnaAverage(e.twin)}%</td>
                        <td className="py-2.5 pr-3">
                          <ConfidenceChip value={Number(e.twin.overall_confidence)} />
                        </td>
                        <td className="py-2.5 pr-3">
                          <button
                            type="button"
                            onClick={() => toggle(e.id)}
                            aria-pressed={active}
                            className={cn(
                              "focus-ring rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                              active
                                ? "border-primary/40 bg-primary/15 text-primary"
                                : "border-border text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {active ? "Selected" : "Add"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Select 2–{MAX_SELECTION} candidates to compare. Ranking reads persisted twin versions only, so results are
              reproducible and traceable in the audit trail.
            </p>
          </div>

          {selected.length < 2 ? (
            <EmptyState
              icon={<Users className="size-6" />}
              title="Pick at least two candidates"
              description="Add candidates from the ranking table to build the side-by-side comparison."
            />
          ) : (
            <>
              {/* Side-by-side header cards */}
              <div className={cn("grid gap-4", selected.length >= 3 ? "lg:grid-cols-3" : "sm:grid-cols-2")}>
                {selected.map((e: Entry, i: number) => (
                  <div key={e.id} className="twin-card p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span
                          className="mb-1 inline-block size-2 rounded-full"
                          style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                          aria-hidden
                        />
                        <p className="truncate font-display text-sm font-semibold">{e.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{e.headline || "No headline parsed"}</p>
                      </div>
                      <Pill
                        tone={
                          e.twin.reliability === "high"
                            ? "success"
                            : e.twin.reliability === "low"
                              ? "warning"
                              : "accent"
                        }
                      >
                        v{e.twin.version}
                      </Pill>
                    </div>
                    <p className="mt-3 line-clamp-4 text-xs leading-relaxed text-muted-foreground">
                      {e.twin.recruiter_summary || "No recruiter summary recorded."}
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                      <ConfidenceChip value={Number(e.twin.overall_confidence)} />
                      <Link
                        to="/twin/$candidateId"
                        params={{ candidateId: e.id }}
                        className="focus-ring text-xs font-medium twin-gradient-text"
                      >
                        Open twin →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              {/* DNA overlay */}
              <div className="twin-card p-5">
                <SectionTitle
                  title="Digital DNA overlay"
                  description="Each axis is a modelled competency dimension, scored 0–100"
                />
                <div className="h-[380px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="74%">
                      <PolarGrid stroke="var(--border)" />
                      <PolarAngleAxis dataKey="dimension" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {selected.map((e: Entry, i: number) => (
                        <Radar
                          key={e.id}
                          name={e.name}
                          dataKey={e.name}
                          stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                          strokeWidth={2}
                          fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                          fillOpacity={0.12}
                          isAnimationActive
                          animationDuration={900}
                        />
                      ))}
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {dimensions
                    .map((dim) => {
                      const vals = selected.map((e: Entry) => ({
                        name: e.name,
                        v: clamp((e.twin.dna ?? []).find((d: TwinRow["dna"][number]) => d.dimension === dim)?.score ?? 0),
                        rationale: (e.twin.dna ?? []).find((d: TwinRow["dna"][number]) => d.dimension === dim)?.rationale ?? "",
                      }));
                      const sorted = [...vals].sort((a, b) => b.v - a.v);
                      return { dim, spread: sorted[0]!.v - sorted[sorted.length - 1]!.v, top: sorted[0]! };
                    })
                    .sort((a, b) => b.spread - a.spread)
                    .slice(0, 4)
                    .map((row) => (
                      <div key={row.dim} className="rounded-lg border border-border/60 bg-surface-2/60 p-3">
                        <p className="text-xs font-medium">
                          {row.dim} · <span className="text-primary">{row.top.name} leads by {row.spread} pts</span>
                        </p>
                        {row.top.rationale ? (
                          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{row.top.rationale}</p>
                        ) : null}
                      </div>
                    ))}
                </div>
              </div>

              {/* Prediction matrix */}
              <div className="twin-card p-5">
                <SectionTitle
                  title="Prediction matrix"
                  description="Best value per row is highlighted — expand a row for each candidate's reasoning and evidence"
                />
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Prediction</th>
                        {selected.map((e: Entry) => (
                          <th key={e.id} className="py-2 pr-3 font-medium">
                            {e.name}
                          </th>
                        ))}
                        <th className="py-2 pr-3 font-medium">Spread</th>
                        <th className="py-2 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {predictionKeys.map((key) => {
                        const invert = key === "Burnout Risk";
                        const cells = selected.map((e: Entry) => ({ e, p: pred(e.twin, key) }));
                        const nums = cells.map((c: { e: Entry; p: ReturnType<typeof pred> }) => clamp(c.p?.value ?? 0));
                        const best = invert ? Math.min(...nums) : Math.max(...nums);
                        const spread = Math.max(...nums) - Math.min(...nums);
                        const open = openRow === key;
                        return (
                          <>
                            <tr key={key} className="border-t border-border/60">
                              <td className="py-2.5 pr-3 text-xs">{key}</td>
                              {cells.map((c: { e: Entry; p: ReturnType<typeof pred> }) => {
                                const v = clamp(c.p?.value ?? 0);
                                return (
                                  <td key={c.e.id} className="py-2.5 pr-3">
                                    <span
                                      className={cn(
                                        "inline-flex items-center gap-2 rounded-md px-2 py-0.5 font-display text-sm font-semibold",
                                        v === best && spread > 0 ? "bg-primary/12 text-primary" : "",
                                      )}
                                      style={v === best && spread > 0 ? undefined : { color: toneFor(v, invert) }}
                                    >
                                      {v}%
                                      <span className="text-[10px] font-normal text-muted-foreground">
                                        ±{100 - clamp(c.p?.confidence ?? 0)}
                                      </span>
                                    </span>
                                  </td>
                                );
                              })}
                              <td className="py-2.5 pr-3 text-xs text-muted-foreground">{spread} pts</td>
                              <td className="py-2.5">
                                <button
                                  type="button"
                                  onClick={() => setOpenRow(open ? null : key)}
                                  aria-expanded={open}
                                  aria-label={`Explain ${key}`}
                                  className="focus-ring rounded-md p-1 text-muted-foreground hover:text-foreground"
                                >
                                  <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
                                </button>
                              </td>
                            </tr>
                            {open ? (
                              <tr key={`${key}-detail`} className="border-t border-border/40 bg-surface-2/40">
                                <td colSpan={selected.length + 3} className="p-4">
                                  <div className={cn("grid gap-3", selected.length >= 3 ? "lg:grid-cols-3" : "sm:grid-cols-2")}>
                                    {cells.map((c: { e: Entry; p: ReturnType<typeof pred> }) => (
                                      <div key={c.e.id} className="rounded-lg border border-border/60 p-3">
                                        <p className="text-xs font-medium">{c.e.name}</p>
                                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                          {c.p?.reasoning || "No reasoning recorded for this prediction."}
                                        </p>
                                        {(c.p?.evidence ?? []).length ? (
                                          <ul className="mt-2 space-y-1">
                                            {(c.p?.evidence ?? []).slice(0, 3).map((ev: string, idx: number) => (
                                              <li key={idx} className="text-[11px] text-muted-foreground">
                                                • {ev}
                                              </li>
                                            ))}
                                          </ul>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Key differentiators */}
              {differentiators.length ? (
                <div className="twin-card p-5">
                  <SectionTitle
                    title="Key differentiators"
                    description="Largest explainable gaps across the shortlist, strongest first"
                  />
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {differentiators.map((d) => (
                      <div key={d.key} className="rounded-xl border border-border/60 bg-surface-2/50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">{d.key}</p>
                          <Pill tone="primary">{d.spread} pt gap</Pill>
                        </div>
                        <p className="mt-2 text-[11px] font-medium text-success">Why {d.winner} leads</p>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">{d.reasoning}</p>
                        <p className="mt-2 text-[11px] font-medium text-warning">Why {d.loser} trails</p>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">{d.counter}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Retention, burnout, salary, risk */}
              <div className="twin-card p-5">
                <SectionTitle title="Outcome & risk profile" description="Retention curve, burnout, compensation and flagged risks" />
                <div className={cn("mt-3 grid gap-4", selected.length >= 3 ? "lg:grid-cols-3" : "sm:grid-cols-2")}>
                  {selected.map((e: Entry, i: number) => (
                    <div key={e.id} className="rounded-xl border border-border/60 p-4">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <span
                          className="size-2 rounded-full"
                          style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                          aria-hidden
                        />
                        {e.name}
                      </p>
                      <div className="mt-3 space-y-2">
                        <MetricBar label="Retention · 6 months" value={clamp(e.twin.retention?.six_months ?? 0)} />
                        <MetricBar label="Retention · 1 year" value={clamp(e.twin.retention?.one_year ?? 0)} />
                        <MetricBar label="Retention · 2 years" value={clamp(e.twin.retention?.two_years ?? 0)} />
                        <MetricBar
                          label={`Burnout risk (${e.twin.burnout?.level ?? "unrated"})`}
                          value={clamp(e.twin.burnout?.risk ?? 0)}
                          invert
                        />
                        <MetricBar
                          label="Offer acceptance"
                          value={clamp(e.twin.salary?.acceptance_probability ?? 0)}
                        />
                      </div>
                      <p className="mt-3 text-[11px] text-muted-foreground">
                        Market {e.twin.salary?.currency ?? "USD"}{" "}
                        {Number(e.twin.salary?.market_value ?? 0).toLocaleString()} · expects{" "}
                        {Number(e.twin.salary?.expected ?? 0).toLocaleString()}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(e.twin.risk ?? []).slice(0, 4).map((r: TwinRow["risk"][number]) => (
                          <Pill
                            key={r.factor}
                            tone={r.level === "high" ? "danger" : r.level === "medium" ? "warning" : "success"}
                          >
                            {r.factor} {clamp(r.score)}%
                          </Pill>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
