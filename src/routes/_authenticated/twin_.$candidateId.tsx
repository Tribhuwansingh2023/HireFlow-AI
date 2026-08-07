import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BrainCircuit,
  ChevronRight,
  FlaskConical,
  Gauge as GaugeIcon,
  History,
  Loader2,
  ScrollText,
  ShieldAlert,
  Sparkles,
  Users2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { LoadingPanel, Pill, humanise } from "@/components/ui-kit";
import {
  ConfidenceChip,
  Gauge,
  MetricBar,
  SectionTitle,
  TwinRadar,
  clamp,
  toneFor,
  useCountUp,
} from "@/components/twin-visuals";
import { generateDigitalTwin } from "@/lib/twin.functions";
import { TWIN_MODEL_VERSION, type TwinScenario } from "@/lib/twin";
import { errorMessage } from "@/lib/audit";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated/twin_/$candidateId")({
  head: () => ({
    meta: [
      { title: "Digital Twin forecast — HireFlow AI" },
      {
        name: "description",
        content:
          "An explainable AI Digital Twin of a candidate: DNA radar, 15 future predictions, promotion path, retention, burnout, team chemistry, salary and risk analysis.",
      },
      { property: "og:title", content: "Digital Twin forecast — HireFlow AI" },
      {
        property: "og:description",
        content: "Explainable candidate success predictions with evidence, confidence and decision paths.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TwinDetail,
  errorComponent: ({ error }) => (
    <div className="twin-card p-6 text-sm text-muted-foreground">Could not load this twin: {error.message}</div>
  ),
  notFoundComponent: () => <div className="twin-card p-6 text-sm">Candidate not found.</div>,
});

const SLIDERS: Array<{ key: keyof TwinScenario; label: string; max: number; suffix: string }> = [
  { key: "years_experience", label: "Years of experience", max: 25, suffix: " yrs" },
  { key: "communication", label: "Communication", max: 100, suffix: "" },
  { key: "leadership", label: "Leadership", max: 100, suffix: "" },
  { key: "technical", label: "Technical skill", max: 100, suffix: "" },
  { key: "education_level", label: "Education level", max: 5, suffix: "" },
  { key: "certifications", label: "Certifications", max: 10, suffix: "" },
];

function TwinDetail() {
  const { candidateId } = Route.useParams();
  const qc = useQueryClient();
  const { canWrite } = useAuth();

  const [explain, setExplain] = useState<any | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [simMode, setSimMode] = useState(false);
  const [scenario, setScenario] = useState<TwinScenario>({});

  const { data, isLoading } = useQuery({
    queryKey: ["twin", candidateId],
    queryFn: async () => {
      const [{ data: candidate, error }, { data: twins, error: tErr }, { data: apps }] = await Promise.all([
        supabase.from("candidates").select("*").eq("id", candidateId).maybeSingle(),
        supabase
          .from("candidate_twins")
          .select("*")
          .eq("candidate_id", candidateId)
          .order("created_at", { ascending: false }),
        supabase
          .from("applications")
          .select("id, stage, status, match_score, job:jobs(id,title,department,location,salary_min,salary_max)")
          .eq("candidate_id", candidateId)
          .order("created_at", { ascending: false }),
      ]);
      if (error) throw new Error(error.message);
      if (tErr) throw new Error(tErr.message);
      return { candidate, twins: twins ?? [], apps: apps ?? [] };
    },
  });

  const baseline = useMemo(() => (data?.twins ?? []).find((t: any) => !t.is_simulation) ?? null, [data]);
  const simulation = useMemo(() => (data?.twins ?? []).find((t: any) => t.is_simulation) ?? null, [data]);
  const twin = simMode && simulation ? simulation : baseline;

  const run = useMutation({
    mutationFn: async (opts: { simulation: boolean }) =>
      generateDigitalTwin({
        data: {
          candidateId,
          ...(opts.simulation ? { scenario, simulation: true } : {}),
        },
      }),
    onSuccess: (_r, v) => {
      toast.success(v.simulation ? "Simulation complete — predictions re-forecast" : "Digital Twin generated");
      if (v.simulation) setSimMode(true);
      qc.invalidateQueries({ queryKey: ["twin", candidateId] });
      qc.invalidateQueries({ queryKey: ["twin-index"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const confidence = useCountUp(clamp(twin?.overall_confidence ?? 0));

  if (isLoading) return <LoadingPanel rows={6} label="Loading Digital Twin…" />;
  if (!data?.candidate) return <div className="twin-card p-6 text-sm">Candidate not found.</div>;

  const c = data.candidate;
  const latestApp: any = data.apps[0] ?? null;
  const dna = (twin?.dna ?? []) as any[];
  const predictions = (twin?.predictions ?? []) as any[];
  const retention = (twin?.retention ?? {}) as any;
  const burnout = (twin?.burnout ?? {}) as any;
  const chemistry = (twin?.team_chemistry ?? {}) as any;
  const salary = (twin?.salary ?? {}) as any;
  const risks = (twin?.risk ?? []) as any[];
  const initials = String(c.full_name ?? "?")
    .split(" ")
    .map((p: string) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const baselineValue = (key: string) =>
    ((baseline?.predictions ?? []) as any[]).find((p) => p.key === key)?.value;

  return (
    <>
      <Link
        to="/twin"
        className="focus-ring mb-4 inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All digital twins
      </Link>

      {/* ---------------- Header ---------------- */}
      <header className="twin-card relative mb-6 overflow-hidden p-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{ backgroundImage: "var(--gradient-twin)", backgroundSize: "220% 220%" }}
        />
        <div className="relative flex flex-wrap items-start gap-6">
          <div
            className="grid size-20 shrink-0 place-items-center rounded-2xl font-display text-xl font-semibold"
            style={{ backgroundImage: "var(--gradient-twin)", color: "var(--primary-foreground)" }}
            aria-hidden
          >
            {initials}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              AI Hiring Digital Twin · {TWIN_MODEL_VERSION}
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">{c.full_name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{c.headline || "Role not parsed"}</p>
            <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-xs sm:grid-cols-4">
              <Fact label="Experience" value={`${c.years_experience} years`} />
              <Fact label="Location" value={c.location || "—"} />
              <Fact
                label="Current company"
                value={(Array.isArray(c.work_history) && (c.work_history as any[])[0]?.company) || "—"}
              />
              <Fact
                label="Target role"
                value={latestApp?.job?.title ?? "—"}
              />
            </dl>
          </div>

          <div className="flex flex-col items-end gap-3">
            {twin ? (
              <>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">AI confidence</p>
                  <p className="font-display text-4xl font-semibold twin-gradient-text">{confidence}%</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Prediction reliability ·{" "}
                    <span style={{ color: toneFor(twin.reliability === "high" ? 90 : twin.reliability === "medium" ? 60 : 30) }}>
                      {humanise(twin.reliability)}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    onClick={() => setShowHistory(true)}
                    className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-2"
                  >
                    <History className="size-3.5" />
                    v{twin.version} · history
                  </button>
                  {canWrite ? (
                    <button
                      onClick={() => run.mutate({ simulation: false })}
                      disabled={run.isPending}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-2 disabled:opacity-60"
                    >
                      {run.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                      Re-run twin
                    </button>
                  ) : null}
                </div>
              </>
            ) : canWrite ? (
              <button
                onClick={() => run.mutate({ simulation: false })}
                disabled={run.isPending}
                className="twin-gradient-bar focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {run.isPending ? <Loader2 className="size-4 animate-spin" /> : <BrainCircuit className="size-4" />}
                Generate Digital Twin
              </button>
            ) : (
              <Pill tone="neutral">No twin generated</Pill>
            )}
          </div>
        </div>
      </header>

      {!twin ? (
        <div className="twin-card p-10 text-center">
          <BrainCircuit className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-display text-lg font-semibold">No forecast yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            The twin is inferred from this candidate's resume, screening breakdowns, interview feedback, recruiter
            communication and your workspace's historical hiring benchmarks. Generate it to see the full forecast.
          </p>
          {run.isPending ? (
            <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Running inference across every evidence source…
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-6">
          {simulation ? (
            <div className="twin-card flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-xs text-muted-foreground">
                A what-if simulation exists for this candidate. Toggle between the recorded baseline and the simulated
                forecast — both are stored separately and never overwrite each other.
              </p>
              <div className="flex overflow-hidden rounded-lg border border-border text-xs">
                <button
                  onClick={() => setSimMode(false)}
                  className={`px-3 py-1.5 ${!simMode ? "bg-surface-2 font-medium" : ""}`}
                >
                  Baseline v{baseline?.version}
                </button>
                <button
                  onClick={() => setSimMode(true)}
                  className={`px-3 py-1.5 ${simMode ? "bg-surface-2 font-medium" : ""}`}
                >
                  Simulation v{simulation.version}
                </button>
              </div>
            </div>
          ) : null}

          {/* ---------------- Digital DNA ---------------- */}
          <section className="twin-card p-6">
            <SectionTitle
              title="Digital DNA score"
              description="Ten behavioural and technical dimensions inferred from evidence. The dashed ring is the model's confidence in each dimension."
            />
            <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
              <TwinRadar
                data={dna.map((d) => ({
                  dimension: d.dimension,
                  score: clamp(d.score),
                  confidence: clamp(d.confidence),
                }))}
              />
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {dna.map((d) => (
                  <li key={d.dimension} className="rounded-xl border border-border/70 bg-surface-2/40 p-3">
                    <MetricBar label={d.dimension} value={clamp(d.score)} />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <ConfidenceChip value={clamp(d.confidence)} />
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{d.rationale}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* ---------------- Predictions ---------------- */}
          <section>
            <SectionTitle
              title="AI future predictions"
              description="Fifteen calibrated forecasts. Open any card to inspect the exact features, evidence and decision path behind it."
            />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {predictions.map((p) => {
                const invert = p.key === "Burnout Risk";
                const base = baselineValue(p.key);
                const delta = simMode && typeof base === "number" ? clamp(p.value) - clamp(base) : 0;
                return (
                  <article key={p.key} className="twin-card twin-card-hover flex flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-medium">{p.key}</h3>
                      <ConfidenceChip value={clamp(p.confidence)} />
                    </div>
                    <div className="mt-3 flex items-end gap-2">
                      <span
                        className="font-display text-3xl font-semibold"
                        style={{ color: toneFor(clamp(p.value), invert) }}
                      >
                        {clamp(p.value)}%
                      </span>
                      {delta !== 0 ? (
                        <span
                          className="mb-1 text-xs font-medium"
                          style={{ color: delta > 0 ? "var(--success)" : "var(--destructive)" }}
                        >
                          {delta > 0 ? "+" : ""}
                          {delta} vs baseline
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2">
                      <MetricBar label="" value={clamp(p.value)} invert={invert} />
                    </div>
                    <p className="mt-3 flex-1 text-xs leading-relaxed text-muted-foreground">{p.reasoning}</p>
                    <ul className="mt-3 space-y-1">
                      {(p.evidence ?? []).slice(0, 3).map((e: string, i: number) => (
                        <li key={i} className="flex gap-1.5 text-[11px] text-muted-foreground">
                          <span style={{ color: "var(--twin-cyan)" }}>•</span>
                          <span className="min-w-0">{e}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => setExplain({ ...p, twin })}
                      className="focus-ring mt-4 inline-flex items-center gap-1 self-start rounded-md text-xs font-medium twin-gradient-text"
                    >
                      View AI reasoning <ChevronRight className="size-3.5" style={{ color: "var(--twin-cyan)" }} />
                    </button>
                  </article>
                );
              })}
            </div>
          </section>

          {/* ---------------- Promotion path + trajectory ---------------- */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="twin-card p-6">
              <SectionTitle title="Promotion prediction" description="Forecast progression, with the model's probability for each step." />
              <ol className="relative ml-3 space-y-5 border-l border-border pl-6">
                <li className="rise-in relative">
                  <Dot color="var(--twin-blue)" />
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Current</p>
                  <p className="font-display text-sm font-semibold">{c.headline || latestApp?.job?.title || "Current role"}</p>
                </li>
                {((twin.promotion_path ?? []) as any[]).map((s, i) => (
                  <li key={i} className="rise-in relative" style={{ animationDelay: `${(i + 1) * 90}ms` }}>
                    <Dot color="var(--twin-cyan)" />
                    <div className="flex flex-wrap items-baseline gap-2">
                      <p className="font-display text-sm font-semibold">{s.role}</p>
                      <span className="text-[11px] text-muted-foreground">in ~{s.eta_years} years</span>
                      <span className="text-[11px] font-medium" style={{ color: toneFor(clamp(s.probability)) }}>
                        {clamp(s.probability)}% likely
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{s.rationale}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section className="twin-card p-6">
              <SectionTitle title="Career trajectory" description="Each transition explained by the model." />
              <ol className="relative ml-3 space-y-5 border-l border-border pl-6">
                {((twin.trajectory ?? []) as any[]).map((t, i) => (
                  <li key={i} className="rise-in relative" style={{ animationDelay: `${i * 80}ms` }}>
                    <Dot color={i < 2 ? "var(--muted-foreground)" : "var(--twin-violet)"} />
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Pill tone="neutral">{humanise(t.stage)}</Pill>
                      <p className="font-display text-sm font-semibold">{t.label}</p>
                      <span className="text-[11px] text-muted-foreground">{t.period}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t.explanation}</p>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          {/* ---------------- Skill evolution ---------------- */}
          <section className="twin-card p-6">
            <SectionTitle
              title="Skill evolution"
              description="Projected growth per skill over the model's horizon, based on demonstrated learning velocity."
            />
            <div className="grid gap-5 md:grid-cols-2">
              {((twin.skill_evolution ?? []) as any[]).map((s, i) => (
                <MetricBar
                  key={i}
                  label={`${s.skill} · ${s.horizon_months ?? 24} mo horizon`}
                  value={clamp(s.now)}
                  projected={clamp(s.projected)}
                  suffix=""
                  note={s.rationale}
                />
              ))}
            </div>
          </section>

          {/* ---------------- Retention + burnout ---------------- */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="twin-card p-6">
              <SectionTitle title="Retention prediction" description="Likelihood the candidate is still with the company." />
              <div className="grid grid-cols-3 gap-4">
                {[
                  ["6 months", retention.six_months],
                  ["1 year", retention.one_year],
                  ["2 years", retention.two_years],
                ].map(([label, v]) => (
                  <div key={String(label)} className="rounded-xl border border-border/70 bg-surface-2/40 p-4 text-center">
                    <p className="font-display text-2xl font-semibold" style={{ color: toneFor(clamp(v)) }}>
                      {clamp(v)}%
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{String(label)}</p>
                  </div>
                ))}
              </div>
              <ul className="mt-5 space-y-3">
                {((retention.drivers ?? []) as any[]).map((d, i) => (
                  <li key={i}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-medium">{d.factor}</span>
                      <span
                        className="font-mono"
                        style={{ color: Number(d.impact) >= 0 ? "var(--success)" : "var(--destructive)" }}
                      >
                        {Number(d.impact) > 0 ? "+" : ""}
                        {Math.round(Number(d.impact) || 0)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="twin-grow h-full rounded-full"
                        style={{
                          width: `${Math.min(100, Math.abs(Number(d.impact) || 0))}%`,
                          background: Number(d.impact) >= 0 ? "var(--success)" : "var(--destructive)",
                        }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{d.note}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="twin-card p-6">
              <SectionTitle
                title="Burnout analysis"
                description="Workload and stress exposure modelled from role demands and history."
                right={
                  <Pill
                    tone={
                      burnout.level === "low" ? "success" : burnout.level === "high" ? "danger" : "warning"
                    }
                  >
                    {humanise(burnout.level ?? "moderate")} risk
                  </Pill>
                }
              />
              <div className="flex flex-wrap items-center justify-center gap-6">
                <Gauge value={clamp(burnout.risk)} label="Burnout risk" invert caption="lower is better" />
                <div className="min-w-[220px] flex-1 space-y-4">
                  <MetricBar label="Mental workload" value={clamp(burnout.mental_workload)} invert />
                  <MetricBar label="Context switching" value={clamp(burnout.context_switching)} invert />
                  <MetricBar label="Stress exposure" value={clamp(burnout.stress)} invert />
                </div>
              </div>
              <div className="mt-5 rounded-xl border border-border/70 bg-surface-2/40 p-4">
                <p className="text-xs font-medium">Recovery suggestions</p>
                <ul className="mt-2 space-y-1">
                  {((burnout.recovery ?? []) as string[]).map((r, i) => (
                    <li key={i} className="flex gap-1.5 text-[11px] text-muted-foreground">
                      <span style={{ color: "var(--success)" }}>•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>

          {/* ---------------- Chemistry + salary ---------------- */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="twin-card p-6">
              <SectionTitle
                title="Team chemistry"
                description="Compatibility with the people already in this workspace."
                right={<Users2 className="size-4 text-muted-foreground" />}
              />
              <div className="flex items-center gap-5">
                <Gauge value={clamp(chemistry.compatibility)} label="Compatibility" size={132} />
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Best team match</p>
                  <p className="font-display text-lg font-semibold">{chemistry.best_match || "—"}</p>
                </div>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {((chemistry.reasons ?? []) as any[]).map((r, i) => (
                  <MetricBar key={i} label={r.factor} value={clamp(r.score)} note={r.note} />
                ))}
              </div>
            </section>

            <section className="twin-card p-6">
              <SectionTitle title="Salary satisfaction" description="Market position, expectation gap and offer dynamics." />
              <div className="grid grid-cols-3 gap-3">
                {[
                  ["Market value", salary.market_value],
                  ["Expected", salary.expected],
                  ["Budget", salary.budget],
                ].map(([label, v]) => (
                  <div key={String(label)} className="rounded-xl border border-border/70 bg-surface-2/40 p-3 text-center">
                    <p className="font-display text-base font-semibold">
                      {Number(v) ? `${salary.currency ?? "USD"} ${Number(v).toLocaleString()}` : "—"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{String(label)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-6">
                <Gauge value={clamp(salary.satisfaction)} label="Satisfaction" size={132} />
                <Gauge value={clamp(salary.acceptance_probability)} label="Offer acceptance" size={132} />
                <div className="text-center">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Negotiation difficulty</p>
                  <p
                    className="font-display text-lg font-semibold"
                    style={{
                      color: toneFor(
                        salary.negotiation_difficulty === "low" ? 85 : salary.negotiation_difficulty === "high" ? 25 : 55,
                      ),
                    }}
                  >
                    {humanise(salary.negotiation_difficulty ?? "medium")}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">{salary.note}</p>
            </section>
          </div>

          {/* ---------------- Risk ---------------- */}
          <section className="twin-card p-6">
            <SectionTitle
              title="Risk analysis"
              description="Integrity checks across the application. Higher score means higher risk."
              right={<ShieldAlert className="size-4 text-muted-foreground" />}
            />
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-5">
              {risks.map((r, i) => (
                <div key={i} className="flex flex-col items-center">
                  <Gauge value={clamp(r.score)} label={r.factor} invert size={132} />
                  <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">{r.note}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ---------------- What-if ---------------- */}
          {canWrite ? (
            <section className="twin-card p-6">
              <SectionTitle
                title="What-if simulation"
                description="Move the levers, re-run inference, and compare every prediction against the recorded baseline. Simulations are stored separately and audited."
                right={<FlaskConical className="size-4 text-muted-foreground" />}
              />
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {SLIDERS.map((s) => {
                  const fallback =
                    s.key === "years_experience"
                      ? Math.round(Number(c.years_experience) || 0)
                      : s.key === "education_level"
                        ? Math.min(5, (Array.isArray(c.education) ? (c.education as any[]).length : 0) + 1)
                        : s.key === "certifications"
                          ? 0
                          : clamp(
                              dna.find((d) =>
                                s.key === "communication"
                                  ? d.dimension === "Communication"
                                  : s.key === "leadership"
                                    ? d.dimension === "Leadership"
                                    : d.dimension === "Technical Skill",
                              )?.score ?? 60,
                            );
                  const value = scenario[s.key] ?? fallback;
                  return (
                    <div key={s.key}>
                      <div className="flex items-baseline justify-between text-xs">
                        <label htmlFor={s.key} className="font-medium">
                          {s.label}
                        </label>
                        <span className="font-mono text-muted-foreground">
                          {value}
                          {s.suffix}
                        </span>
                      </div>
                      <input
                        id={s.key}
                        type="range"
                        min={0}
                        max={s.max}
                        value={value}
                        onChange={(e) => setScenario((prev) => ({ ...prev, [s.key]: Number(e.target.value) }))}
                        className="focus-ring mt-2 w-full accent-[var(--twin-blue)]"
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => run.mutate({ simulation: true })}
                  disabled={run.isPending || Object.keys(scenario).length === 0}
                  className="twin-gradient-bar focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {run.isPending ? <Loader2 className="size-4 animate-spin" /> : <GaugeIcon className="size-4" />}
                  Run simulation
                </button>
                {Object.keys(scenario).length ? (
                  <button
                    onClick={() => setScenario({})}
                    className="focus-ring rounded-xl border border-border px-4 py-2.5 text-sm hover:bg-surface-2"
                  >
                    Reset levers
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground">Adjust at least one lever to run a counterfactual.</p>
                )}
              </div>
            </section>
          ) : null}

          {/* ---------------- Recruiter insight ---------------- */}
          <section className="twin-card relative overflow-hidden p-6">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.1]"
              style={{ backgroundImage: "var(--gradient-twin)" }}
            />
            <div className="relative">
              <SectionTitle title="Recruiter insights" description="The model's plain-language brief for the hiring team." />
              <p className="max-w-4xl whitespace-pre-line text-sm leading-relaxed">{twin.recruiter_summary}</p>
              <p className="mt-4 text-[11px] text-muted-foreground">
                Generated {new Date(twin.created_at).toLocaleString()} · model {twin.model} · {TWIN_MODEL_VERSION} ·
                version {twin.version}
                {twin.is_simulation ? " · simulation" : ""}
              </p>
            </div>
          </section>
        </div>
      )}

      {/* ---------------- Explainability drawer ---------------- */}
      {explain ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-background/80 backdrop-blur-sm"
          onClick={() => setExplain(null)}
        >
          <div
            className="twin-card h-full w-full max-w-lg overflow-y-auto rounded-none rounded-l-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Explainable AI</p>
                <h2 className="font-display text-lg font-semibold">{explain.key}</h2>
              </div>
              <button onClick={() => setExplain(null)} className="focus-ring rounded-md p-2" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-5 flex items-center gap-4">
              <span
                className="font-display text-4xl font-semibold"
                style={{ color: toneFor(clamp(explain.value), explain.key === "Burnout Risk") }}
              >
                {clamp(explain.value)}%
              </span>
              <ConfidenceChip value={clamp(explain.confidence)} />
            </div>

            <Block title="Why the model predicted this">
              <p className="text-xs leading-relaxed text-muted-foreground">{explain.reasoning}</p>
            </Block>

            <Block title="Evidence used">
              <ul className="space-y-1.5">
                {(explain.evidence ?? []).map((e: string, i: number) => (
                  <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                    <span style={{ color: "var(--twin-cyan)" }}>•</span>
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
            </Block>

            <Block title="Contributing features">
              <ul className="space-y-3">
                {(explain.features ?? []).map((f: any, i: number) => (
                  <li key={i}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span>{f.name}</span>
                      <span
                        className="font-mono"
                        style={{ color: f.direction === "negative" ? "var(--destructive)" : "var(--success)" }}
                      >
                        {f.direction === "negative" ? "−" : "+"}
                        {Math.round((Number(f.weight) || 0) * 100)}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="twin-grow h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (Number(f.weight) || 0) * 100)}%`,
                          background: f.direction === "negative" ? "var(--destructive)" : "var(--success)",
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Block>

            <Block title="Decision path">
              <ol className="relative ml-2 space-y-3 border-l border-border pl-5">
                {(explain.decision_path ?? []).map((step: string, i: number) => (
                  <li key={i} className="relative text-xs text-muted-foreground">
                    <Dot color="var(--twin-blue)" small />
                    {step}
                  </li>
                ))}
              </ol>
            </Block>

            <Block title="Inference record">
              <dl className="grid grid-cols-2 gap-y-2 text-[11px]">
                <Fact label="Model" value={explain.twin.model} />
                <Fact label="Model version" value={TWIN_MODEL_VERSION} />
                <Fact label="Twin version" value={`v${explain.twin.version}`} />
                <Fact label="Timestamp" value={new Date(explain.twin.created_at).toLocaleString()} />
                <Fact
                  label="Input features"
                  value={`${(explain.twin.inputs as any)?.applications ?? 0} applications · ${(explain.twin.inputs as any)?.interviews ?? 0} interviews · ${(explain.twin.inputs as any)?.skills ?? 0} skills`}
                />
                <Fact label="Mode" value={explain.twin.is_simulation ? "What-if simulation" : "Baseline"} />
              </dl>
              <Link
                to="/audit"
                className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-md text-xs twin-gradient-text"
              >
                <ScrollText className="size-3.5" style={{ color: "var(--twin-cyan)" }} />
                Open the immutable audit trail
              </Link>
            </Block>
          </div>
        </div>
      ) : null}

      {/* ---------------- History drawer ---------------- */}
      {showHistory ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-background/80 backdrop-blur-sm"
          onClick={() => setShowHistory(false)}
        >
          <div
            className="twin-card h-full w-full max-w-md overflow-y-auto rounded-none rounded-l-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="font-display text-lg font-semibold">Prediction history</h2>
              <button onClick={() => setShowHistory(false)} className="focus-ring rounded-md p-2" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <ul className="mt-5 space-y-3">
              {data.twins.map((t: any) => (
                <li key={t.id} className="rounded-xl border border-border/70 bg-surface-2/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">
                      v{t.version} {t.is_simulation ? "· simulation" : "· baseline"}
                    </p>
                    <ConfidenceChip value={clamp(t.overall_confidence)} />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(t.created_at).toLocaleString()} · {t.model} · {humanise(t.reliability)} reliability
                  </p>
                  {Object.keys((t.scenario as any) ?? {}).length ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Levers:{" "}
                      {Object.entries(t.scenario as any)
                        .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`)
                        .join(", ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-xs font-medium">{value}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Dot({ color, small = false }: { color: string; small?: boolean }) {
  return (
    <span
      className={`absolute rounded-full ring-4 ring-background ${small ? "size-2 -left-[25px] top-1.5" : "size-2.5 -left-[31px] top-1.5"}`}
      style={{ background: color }}
      aria-hidden
    />
  );
}
