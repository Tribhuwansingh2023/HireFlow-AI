import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BrainCircuit,
  Check,
  Download,
  Gavel,
  Loader2,
  MessageSquareText,
  Play,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState, InlineAlert, LoadingPanel, Pill } from "@/components/ui-kit";
import {
  AgentAvatar,
  ConflictCard,
  ConsensusGauge,
  CouncilSeat,
  DebateBubble,
  EvidenceList,
  ReasoningGraphView,
  VerdictBadge,
  VoteDistribution,
  WorkflowTimeline,
} from "@/components/debate-visuals";
import {
  AGENT_BY_KEY,
  COUNCIL,
  GRAPH_NODES,
  SCENARIO_FIELDS,
  SUGGESTED_QUESTIONS,
  VERDICT_LABEL,
  type AgentKey,
  type AgentOpinion,
  type Conflict,
  type CouncilVote,
  type DebateRecord,
  type DebateScenario,
  type DebateTurn,
  type FinalDecision,
  type ReasoningGraph,
  type Verdict,
} from "@/lib/debate";
import { askDebate, listCandidateDebates, recordDebateDecision } from "@/lib/debate.functions";
import { errorMessage } from "@/lib/audit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/debate_/$candidateId")({
  validateSearch: (search: Record<string, unknown>) => ({
    debate: typeof search["debate"] === "string" ? (search["debate"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "AI Hiring Council Boardroom — HireFlow AI" },
      {
        name: "description",
        content:
          "Watch ten specialist AI agents evaluate, cross-examine and vote on a candidate, then record your own decision with a full audit trail.",
      },
      { property: "og:title", content: "AI Hiring Council Boardroom — HireFlow AI" },
      { property: "og:description", content: "Transparent, evidence-backed multi-agent hiring decisions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Boardroom,
});

type LiveState = {
  running: boolean;
  activeNode: string | null;
  doneNodes: Set<string>;
  opinions: AgentOpinion[];
  rounds: DebateTurn[];
  conflicts: Conflict[];
  votes: CouncilVote[];
  consensus: number;
  final: FinalDecision | null;
  graph: ReasoningGraph | null;
  timeline: Array<{ node: string; label: string; agent: AgentKey | null; ms: number; summary: string }>;
  debateId: string | null;
  error: string | null;
};

const EMPTY: LiveState = {
  running: false,
  activeNode: null,
  doneNodes: new Set(),
  opinions: [],
  rounds: [],
  conflicts: [],
  votes: [],
  consensus: 0,
  final: null,
  graph: null,
  timeline: [],
  debateId: null,
  error: null,
};

function Boardroom() {
  const { candidateId } = Route.useParams();
  const search = Route.useSearch();
  const queryClient = useQueryClient();

  const loadFn = useServerFn(listCandidateDebates);
  const decideFn = useServerFn(recordDebateDecision);
  const askFn = useServerFn(askDebate);

  const { data, isLoading } = useQuery({
    queryKey: ["debate-candidate", candidateId],
    queryFn: () => loadFn({ data: { candidateId } }),
  });

  const [live, setLive] = useState<LiveState>(EMPTY);
  const [selectedAgent, setSelectedAgent] = useState<AgentKey | null>(null);
  const [jobId, setJobId] = useState<string>("");
  const [viewDebateId, setViewDebateId] = useState<string | null>(search.debate ?? null);
  const [scenario, setScenario] = useState<DebateScenario>({});
  const [whatIf, setWhatIf] = useState(false);
  const [comment, setComment] = useState("");
  const [question, setQuestion] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const applications = (data?.applications ?? []) as any[];
  useEffect(() => {
    if (!jobId && applications.length) setJobId(applications[0].job_id ?? "");
  }, [applications, jobId]);

  const debates = (data?.debates ?? []) as unknown as DebateRecord[];
  const stored = useMemo(
    () => debates.find((d) => d.id === (viewDebateId ?? live.debateId)) ?? debates.find((d) => !d.is_simulation) ?? null,
    [debates, viewDebateId, live.debateId],
  );

  /* Live run takes precedence while streaming; otherwise show the stored record. */
  const showing = live.running || live.final ? "live" : stored ? "stored" : "none";
  const opinions = showing === "live" ? live.opinions : ((stored?.opinions ?? []) as AgentOpinion[]);
  const rounds = showing === "live" ? live.rounds : ((stored?.rounds ?? []) as DebateTurn[]);
  const conflicts = showing === "live" ? live.conflicts : ((stored?.conflicts ?? []) as Conflict[]);
  const votes = showing === "live" ? live.votes : ((stored?.votes ?? []) as CouncilVote[]);
  const final = showing === "live" ? live.final : ((stored?.final ?? null) as FinalDecision | null);
  const consensus = showing === "live" ? live.consensus : Number(stored?.consensus ?? 0);
  const graph = showing === "live" ? live.graph : ((stored?.graph ?? null) as ReasoningGraph | null);
  const timeline = showing === "live" ? live.timeline : (stored?.timeline ?? []);
  const activeDebateId = live.debateId ?? stored?.id ?? null;

  const { data: messages } = useQuery({
    queryKey: ["debate-messages", activeDebateId],
    enabled: Boolean(activeDebateId),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("debate_messages")
        .select("*")
        .eq("debate_id", activeDebateId!)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return rows ?? [];
    },
  });

  /* ------------------------------------------------------------ */

  const runCouncil = useCallback(
    async (simulate: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSelectedAgent(null);
      setViewDebateId(null);
      setLive({ ...EMPTY, running: true, doneNodes: new Set() });

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("Your session expired. Please sign in again.");

        const res = await fetch("/api/debate", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            candidateId,
            jobId: jobId || null,
            simulation: simulate,
            scenario: simulate ? scenario : {},
            parentDebateId: simulate ? (stored?.id ?? null) : null,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(await res.text().catch(() => "The council is unavailable."));

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            let event: any;
            try {
              event = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            setLive((prev) => {
              const next: LiveState = { ...prev, doneNodes: new Set(prev.doneNodes) };
              switch (event.type) {
                case "node":
                  if (event.phase === "start") next.activeNode = event.node;
                  else {
                    next.doneNodes.add(event.node);
                    if (next.activeNode === event.node) next.activeNode = null;
                    next.timeline = [
                      ...next.timeline,
                      { node: event.node, label: event.label, agent: event.agent ?? null, ms: event.ms ?? 0, summary: event.summary ?? "" },
                    ];
                  }
                  break;
                case "opinion":
                  next.opinions = [...next.opinions, event.opinion];
                  break;
                case "turn":
                  next.rounds = [...next.rounds, event.turn];
                  break;
                case "conflicts":
                  next.conflicts = event.conflicts ?? [];
                  break;
                case "votes":
                  next.votes = event.votes ?? [];
                  next.consensus = event.consensus ?? 0;
                  break;
                case "final":
                  next.final = event.final ?? null;
                  next.consensus = event.consensus ?? next.consensus;
                  break;
                case "saved":
                  next.debateId = event.debate?.id ?? null;
                  next.graph = event.debate?.graph ?? null;
                  next.running = false;
                  next.activeNode = null;
                  break;
                case "error":
                  next.error = event.message;
                  next.running = false;
                  next.activeNode = null;
                  break;
                default:
                  break;
              }
              return next;
            });
          }
        }
        setLive((p) => ({ ...p, running: false, activeNode: null }));
        await queryClient.invalidateQueries({ queryKey: ["debate-candidate", candidateId] });
        await queryClient.invalidateQueries({ queryKey: ["council-analytics"] });
        toast.success(simulate ? "Simulated council session complete" : "The council reached a recommendation");
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        const message = errorMessage(e, "The council failed to convene.");
        setLive((p) => ({ ...p, running: false, activeNode: null, error: message }));
        toast.error(message);
      }
    },
    [candidateId, jobId, queryClient, scenario, stored?.id],
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  const decision = useMutation({
    mutationFn: (input: { decision: "approved" | "rejected" | "overridden"; overrideTo?: string }) =>
      decideFn({
        data: {
          debateId: activeDebateId!,
          decision: input.decision,
          ...(comment ? { comment } : {}),
          ...(input.overrideTo ? { overrideTo: input.overrideTo } : {}),
        },
      }),
    onSuccess: async () => {
      setComment("");
      toast.success("Decision recorded in the audit trail");
      await queryClient.invalidateQueries({ queryKey: ["debate-candidate", candidateId] });
      await queryClient.invalidateQueries({ queryKey: ["council-analytics"] });
    },
    onError: (e) => toast.error(errorMessage(e, "Could not record the decision.")),
  });

  const ask = useMutation({
    mutationFn: (q: string) => askFn({ data: { debateId: activeDebateId!, question: q } }),
    onSuccess: async () => {
      setQuestion("");
      await queryClient.invalidateQueries({ queryKey: ["debate-messages", activeDebateId] });
    },
    onError: (e) => toast.error(errorMessage(e, "Could not answer that.")),
  });

  const exportSession = () => {
    if (!stored && !live.final) return;
    const payload = stored ?? { opinions, rounds, conflicts, votes, final, consensus, timeline };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hireflow-council-${candidateId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const seatState = (key: AgentKey): "idle" | "thinking" | "done" => {
    if (opinions.some((o) => o.agent === key)) return "done";
    if (live.running && (live.activeNode === key || live.doneNodes.has("evidence"))) return "thinking";
    return "idle";
  };

  const selected = selectedAgent ? opinions.find((o) => o.agent === selectedAgent) : null;

  if (isLoading) return <LoadingPanel rows={6} label="Loading the boardroom" />;
  if (!data?.candidate) return <EmptyState title="Candidate not found" description="This candidate may have been removed." />;

  const candidate = data.candidate as any;

  return (
    <div className="space-y-6">
      {/* ---------------- Header ---------------- */}
      <header className="panel relative overflow-hidden p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
        <Link to="/debate" className="focus-ring inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> All council sessions
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">AI hiring council</p>
            <h1 className="mt-1 font-display text-3xl font-semibold">{candidate.full_name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {candidate.headline ?? "No headline parsed"} · {candidate.years_experience ?? 0} yrs ·{" "}
              {candidate.location ?? "location unknown"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="focus-ring rounded-lg border border-border bg-background px-3 py-2 text-sm"
              aria-label="Role to deliberate against"
            >
              <option value="">No specific role</option>
              {applications.map((a) => (
                <option key={a.id} value={a.job_id}>
                  {a.job?.title ?? "Role"} {a.match_score ? `· ${a.match_score}/100` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => runCouncil(false)}
              disabled={live.running}
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {live.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
              {live.running ? "Council in session…" : stored ? "Re-run council" : "Convene council"}
            </button>
            <button
              type="button"
              onClick={() => setWhatIf((v) => !v)}
              className="focus-ring inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <Sparkles className="h-4 w-4 text-accent" /> What-if
            </button>
            {(stored || live.final) && (
              <button
                type="button"
                onClick={exportSession}
                className="focus-ring inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <Download className="h-4 w-4" /> Export
              </button>
            )}
          </div>
        </div>

        {(live.running || timeline.length > 0) && (
          <div className="mt-5">
            <WorkflowTimeline nodes={GRAPH_NODES} activeNode={live.activeNode} doneNodes={live.doneNodes.size ? live.doneNodes : new Set(timeline.map((t) => t.node))} />
          </div>
        )}
      </header>

      {live.error ? <InlineAlert tone="danger" title="The council could not finish">{live.error}</InlineAlert> : null}

      {/* ---------------- What-if ---------------- */}
      {whatIf ? (
        <section className="panel p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">What-if simulation</h2>
            <button type="button" onClick={() => setWhatIf(false)} className="focus-ring rounded p-1 text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Change the inputs and re-run the council. Simulated sessions are stored separately and never overwrite the real
            recommendation.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {SCENARIO_FIELDS.map((f) => (
              <label key={f.key} className="block text-sm">
                <span className="flex items-center justify-between">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className="tabular-nums font-medium">
                    {(scenario as any)[f.key] ?? 0}
                    {f.unit}
                  </span>
                </span>
                <input
                  type="range"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={(scenario as any)[f.key] ?? 0}
                  onChange={(e) => setScenario((s) => ({ ...s, [f.key]: Number(e.target.value) }))}
                  className="mt-2 w-full accent-[var(--accent)]"
                />
              </label>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              value={scenario.add_certification ?? ""}
              onChange={(e) => setScenario((s) => ({ ...s, add_certification: e.target.value }))}
              placeholder="Add a certification (e.g. AWS Solutions Architect)"
              className="focus-ring rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              value={scenario.note ?? ""}
              onChange={(e) => setScenario((s) => ({ ...s, note: e.target.value }))}
              placeholder="Recruiter note for the council"
              className="focus-ring rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => runCouncil(true)}
            disabled={live.running}
            className="focus-ring mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
          >
            <Play className="h-4 w-4" /> Run simulated council
          </button>
        </section>
      ) : null}

      {showing === "none" && !live.running ? (
        <EmptyState
          icon={<Gavel className="size-6" />}
          title="The council has not deliberated yet"
          description="Convene the hiring council to have ten specialist agents independently evaluate this candidate, cross-examine each other and vote."
        />
      ) : null}

      {/* ---------------- Council seats ---------------- */}
      {(live.running || opinions.length > 0) && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">The boardroom</h2>
            <p className="text-xs text-muted-foreground">
              {opinions.length}/{COUNCIL.length} agents reported
            </p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {COUNCIL.map((agent) => (
              <CouncilSeat
                key={agent.key}
                agentKey={agent.key}
                opinion={opinions.find((o) => o.agent === agent.key)}
                state={seatState(agent.key)}
                selected={selectedAgent === agent.key}
                onSelect={() => setSelectedAgent((k) => (k === agent.key ? null : agent.key))}
              />
            ))}
          </div>
        </section>
      )}

      {/* ---------------- Selected agent reasoning ---------------- */}
      {selected ? (
        <section className="panel p-5">
          <div className="flex flex-wrap items-center gap-3">
            <AgentAvatar agent={selected.agent} size={40} />
            <div>
              <h3 className="font-display text-lg font-semibold">{AGENT_BY_KEY[selected.agent].name}</h3>
              <p className="text-xs text-muted-foreground">{AGENT_BY_KEY[selected.agent].mandate}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <VerdictBadge verdict={selected.verdict} />
              <Pill tone="info">{selected.confidence}% confidence</Pill>
              <button type="button" onClick={() => setSelectedAgent(null)} className="focus-ring rounded p-1 text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-foreground/90">{selected.reasoning}</p>
          <div className="mt-4 grid gap-5 lg:grid-cols-3">
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Arguments</h4>
              <ul className="mt-2 space-y-1.5 text-sm">
                {selected.arguments.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <Check className="mt-1 h-3 w-3 shrink-0 text-success" />
                    {a}
                  </li>
                ))}
              </ul>
              {selected.concerns.length ? (
                <>
                  <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Concerns</h4>
                  <ul className="mt-2 space-y-1.5 text-sm text-warning">
                    {selected.concerns.map((c, i) => (
                      <li key={i}>• {c}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Evidence used</h4>
              <div className="mt-2">
                <EvidenceList evidence={selected.evidence} />
              </div>
              {selected.data_gaps.length ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Data gaps: </span>
                  {selected.data_gaps.join(", ")}
                </p>
              ) : null}
            </div>
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Decision path</h4>
              <ol className="mt-2 space-y-2">
                {selected.decision_path.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full border border-border text-[10px]">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
              {selected.supporting_data.length ? (
                <dl className="mt-4 space-y-1 text-xs">
                  {selected.supporting_data.map((d, i) => (
                    <div key={i} className="flex justify-between gap-3 border-b border-border/50 pb-1">
                      <dt className="text-muted-foreground">{d.label}</dt>
                      <dd className="font-medium">{d.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* ---------------- Debate transcript + votes ---------------- */}
      {(rounds.length > 0 || votes.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <section className="panel p-5">
            <h2 className="font-display text-lg font-semibold">Cross-examination</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Agents challenge each other's evidence. Positions that changed are marked.
            </p>
            <div className="mt-4 space-y-3">
              {rounds.length ? (
                rounds.map((t, i) => <DebateBubble key={i} turn={t} />)
              ) : live.running ? (
                <p className="text-sm text-muted-foreground">Waiting for the floor to open…</p>
              ) : (
                <p className="text-sm text-muted-foreground">No cross-examination was recorded for this session.</p>
              )}
            </div>
          </section>

          <div className="space-y-6">
            <section className="panel flex flex-col items-center p-5">
              <ConsensusGauge
                value={consensus}
                sub={
                  consensus >= 75
                    ? "The council is aligned"
                    : consensus >= 45
                      ? "Meaningful disagreement remains"
                      : "The council is split — human judgement required"
                }
              />
            </section>
            {votes.length ? (
              <section className="panel p-5">
                <h2 className="font-display text-base font-semibold">Weighted vote</h2>
                <div className="mt-3">
                  <VoteDistribution votes={votes} />
                </div>
              </section>
            ) : null}
          </div>
        </div>
      )}

      {/* ---------------- Conflicts ---------------- */}
      {conflicts.length ? (
        <section>
          <h2 className="font-display text-lg font-semibold">Disagreements detected</h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {conflicts.map((c, i) => (
              <ConflictCard key={i} conflict={c} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------------- Final decision ---------------- */}
      {final ? (
        <section className="panel relative overflow-hidden p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_100%_0%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent)]" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-3">
              <BrainCircuit className="h-5 w-5 text-primary" />
              <h2 className="font-display text-xl font-semibold">Final council recommendation</h2>
              <VerdictBadge verdict={final.recommendation} className="ml-auto" />
              <Pill tone="info">{final.confidence}% confidence</Pill>
              <Pill tone="accent">{final.consensus}% consensus</Pill>
              {stored?.is_simulation ? <Pill tone="warning">simulated</Pill> : null}
            </div>
            <p className="mt-4 max-w-4xl text-sm leading-relaxed text-foreground/90">{final.summary}</p>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <Metric label="Promotion probability" value={`${final.promotion_probability}%`} />
              <Metric label="Predicted retention" value={`${final.retention_prediction}%`} />
              <Metric label="Expected ROI" value={final.expected_roi || "—"} small />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Decisive reasons</h3>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {final.reasons.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <Check className="mt-1 h-3 w-3 shrink-0 text-success" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Risk &amp; dissent</h3>
                <p className="mt-2 text-sm text-muted-foreground">{final.risk_analysis}</p>
                <ul className="mt-2 space-y-1 text-sm text-warning">
                  {final.dissent.map((d, i) => (
                    <li key={i}>• {d}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Business impact</h3>
                <p className="mt-2 text-sm text-muted-foreground">{final.business_impact}</p>
                {final.conditions.length ? (
                  <>
                    <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Conditions</h3>
                    <ul className="mt-2 space-y-1 text-sm">
                      {final.conditions.map((c, i) => (
                        <li key={i}>• {c}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Evidence behind the decision</h3>
                <div className="mt-2">
                  <EvidenceList evidence={final.evidence} />
                </div>
              </div>
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recommended next actions</h3>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {final.next_actions.map((a, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ---------------- Reasoning graph ---------------- */}
      {graph?.nodes?.length ? (
        <section className="panel p-5">
          <h2 className="font-display text-lg font-semibold">Reasoning graph</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            How evidence flowed into each agent, where positions collided, and what drove the final call.
          </p>
          <div className="mt-4">
            <ReasoningGraphView graph={graph} />
          </div>
        </section>
      ) : null}

      {/* ---------------- Human decision ---------------- */}
      {activeDebateId && final ? (
        <section className="panel p-5">
          <h2 className="font-display text-lg font-semibold">Your decision</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The council advises; a human decides. Every action below is written to the audit trail with the AI
            recommendation it replaced.
          </p>
          {stored?.human_decision ? (
            <div className="mt-3 rounded-lg border border-success/30 bg-success/[0.06] p-3 text-sm">
              Recorded decision: <span className="font-medium">{VERDICT_LABEL[stored.human_decision as Verdict] ?? stored.human_decision}</span>
              {stored.human_override ? " (override)" : ""}
              {stored.human_comment ? <span className="text-muted-foreground"> — {stored.human_comment}</span> : null}
            </div>
          ) : null}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Why? (stored with the decision)"
            className="focus-ring mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => decision.mutate({ decision: "approved" })}
              disabled={decision.isPending}
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-success px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
            >
              <ThumbsUp className="h-4 w-4" /> Accept recommendation
            </button>
            <button
              type="button"
              onClick={() => decision.mutate({ decision: "rejected" })}
              disabled={decision.isPending}
              className="focus-ring inline-flex items-center gap-2 rounded-lg border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive disabled:opacity-60"
            >
              <ThumbsDown className="h-4 w-4" /> Reject recommendation
            </button>
            {(["strong_hire", "hire", "hold", "reject"] as Verdict[])
              .filter((v) => v !== final.recommendation)
              .map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => decision.mutate({ decision: "overridden", overrideTo: v })}
                  disabled={decision.isPending}
                  className="focus-ring rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-60"
                >
                  Override → {VERDICT_LABEL[v]}
                </button>
              ))}
          </div>
        </section>
      ) : null}

      {/* ---------------- Ask the council ---------------- */}
      {activeDebateId ? (
        <section className="panel p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <MessageSquareText className="h-4 w-4 text-primary" /> Ask the council
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Interrogate this exact transcript — answers cite the agents and evidence they came from.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => ask.mutate(q)}
                disabled={ask.isPending}
                className="focus-ring rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
              >
                {q}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {(messages ?? []).map((m: any) => (
              <div
                key={m.id}
                className={cn(
                  "rounded-xl border p-3 text-sm",
                  m.role === "user" ? "border-primary/30 bg-primary/[0.06]" : "border-border/60 bg-card/50",
                )}
              >
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {m.role === "user" ? "You" : "Council moderator"}
                  {m.confidence ? ` · ${m.confidence}% confidence` : ""}
                </p>
                <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{m.content}</p>
                {m.evidence?.length ? (
                  <div className="mt-2">
                    <EvidenceList evidence={m.evidence} compact />
                  </div>
                ) : null}
                {m.agents?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.agents.map((a: AgentKey) =>
                      AGENT_BY_KEY[a] ? (
                        <span
                          key={a}
                          className="rounded-md border px-1.5 py-0.5 text-[10px]"
                          style={{ color: AGENT_BY_KEY[a].color, borderColor: `${AGENT_BY_KEY[a].color}44` }}
                        >
                          {AGENT_BY_KEY[a].short}
                        </span>
                      ) : null,
                    )}
                  </div>
                ) : null}
              </div>
            ))}
            {ask.isPending ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reviewing the transcript…
              </p>
            ) : null}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (question.trim()) ask.mutate(question.trim());
            }}
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Why did the Budget Agent disagree?"
              className="focus-ring flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={ask.isPending || !question.trim()}
              className="focus-ring inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      ) : null}

      {/* ---------------- Session history ---------------- */}
      {debates.length > 1 ? (
        <section className="panel p-5">
          <h2 className="font-display text-lg font-semibold">Session history</h2>
          <div className="mt-3 divide-y divide-border/60">
            {debates.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setLive(EMPTY);
                  setViewDebateId(d.id);
                  setSelectedAgent(null);
                }}
                className={cn(
                  "focus-ring flex w-full flex-wrap items-center gap-3 py-2.5 text-left text-sm",
                  (viewDebateId ?? stored?.id) === d.id && "text-primary",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{d.title}</span>
                {d.is_simulation ? <Pill tone="accent">what-if</Pill> : null}
                {d.recommendation ? <VerdictBadge verdict={d.recommendation} /> : null}
                <span className="text-xs text-muted-foreground tabular-nums">{d.consensus}%</span>
                <span className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-display font-semibold", small ? "text-sm leading-snug" : "text-2xl tabular-nums")}>{value}</p>
    </div>
  );
}
