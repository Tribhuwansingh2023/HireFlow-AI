/**
 * AI Recruiter Debate — boardroom visual language.
 * Every component here renders only data produced by the council run.
 */
import { useMemo } from "react";
import { AlertTriangle, ArrowRight, Check, Quote, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { Pill, type PillTone } from "@/components/ui-kit";
import {
  AGENT_BY_KEY,
  VERDICT_LABEL,
  VERDICT_TONE,
  tally,
  type AgentKey,
  type AgentOpinion,
  type Conflict,
  type CouncilVote,
  type DebateTurn,
  type EvidenceRef,
  type ReasoningGraph,
  type Verdict,
} from "@/lib/debate";

/* ------------------------------------------------------------------ */

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  return (
    <Pill tone={VERDICT_TONE[verdict] as PillTone} className={cn("uppercase tracking-wide", className)}>
      {VERDICT_LABEL[verdict]}
    </Pill>
  );
}

export function AgentAvatar({ agent, size = 36, active }: { agent: AgentKey; size?: number; active?: boolean }) {
  const meta = AGENT_BY_KEY[agent];
  const initials = meta.short
    .split(/[\s-]/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-xl border font-semibold",
        active && "animate-pulse",
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        color: meta.color,
        borderColor: `${meta.color}55`,
        background: `linear-gradient(140deg, ${meta.color}22, transparent 70%)`,
        boxShadow: active ? `0 0 0 3px ${meta.color}22` : undefined,
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/* ---------------- Consensus gauge ---------------- */

export function ConsensusGauge({
  value,
  label = "Council consensus",
  size = 168,
  sub,
}: {
  value: number;
  label?: string;
  size?: number;
  sub?: string;
}) {
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const tone = pct >= 75 ? "var(--success)" : pct >= 45 ? "var(--warning)" : "var(--destructive)";
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} ${pct}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={10} className="text-border/60" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 900ms cubic-bezier(.22,1,.36,1)" }}
        />
        <text x="50%" y="47%" textAnchor="middle" className="fill-foreground font-display" fontSize={size * 0.24} fontWeight={600}>
          {pct}%
        </text>
        <text x="50%" y="63%" textAnchor="middle" className="fill-muted-foreground" fontSize={size * 0.075}>
          {label}
        </text>
      </svg>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

/* ---------------- Vote distribution ---------------- */

export function VoteDistribution({ votes }: { votes: CouncilVote[] }) {
  const rows = tally(votes);
  const total = votes.length || 1;
  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.verdict} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">{VERDICT_LABEL[row.verdict]}</span>
            <span className="text-muted-foreground tabular-nums">
              {row.count} {row.count === 1 ? "vote" : "votes"} · weight {row.weight}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700",
                row.verdict === "strong_hire" && "bg-success",
                row.verdict === "hire" && "bg-info",
                row.verdict === "hold" && "bg-warning",
                row.verdict === "reject" && "bg-destructive",
              )}
              style={{ width: `${(row.count / total) * 100}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {votes
              .filter((v) => v.verdict === row.verdict)
              .map((v) => (
                <span
                  key={v.agent}
                  title={`${AGENT_BY_KEY[v.agent].name} · ${v.confidence}% confidence`}
                  className="rounded-md border px-1.5 py-0.5 text-[10px]"
                  style={{ color: AGENT_BY_KEY[v.agent].color, borderColor: `${AGENT_BY_KEY[v.agent].color}44` }}
                >
                  {AGENT_BY_KEY[v.agent].short}
                </span>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Evidence chips ---------------- */

export function EvidenceList({ evidence, compact }: { evidence: EvidenceRef[]; compact?: boolean }) {
  if (!evidence?.length) return null;
  return (
    <ul className={cn("space-y-1.5", compact && "space-y-1")}>
      {evidence.map((e, i) => (
        <li key={i} className="flex gap-2 text-xs text-muted-foreground">
          <span className="mt-0.5 shrink-0 rounded border border-primary/30 bg-primary/10 px-1.5 py-px text-[10px] uppercase tracking-wide text-primary">
            {e.source}
          </span>
          <span className="text-foreground/85">
            {e.label}
            {e.detail ? <span className="text-muted-foreground"> — {e.detail}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Agent opinion card ---------------- */

export function CouncilSeat({
  agentKey,
  opinion,
  state,
  onSelect,
  selected,
}: {
  agentKey: AgentKey;
  opinion?: AgentOpinion | undefined;
  state: "idle" | "thinking" | "done";
  onSelect?: () => void;
  selected?: boolean;
}) {
  const meta = AGENT_BY_KEY[agentKey];
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!opinion}
      className={cn(
        "focus-ring group relative w-full overflow-hidden rounded-2xl border bg-card/60 p-4 text-left backdrop-blur transition-all",
        state === "thinking" && "border-primary/50 shadow-[0_0_0_1px_var(--primary)]",
        selected ? "border-primary/60 bg-card" : "border-border/70 hover:border-border",
        !opinion && "cursor-default opacity-80",
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-70"
        style={{ background: `linear-gradient(90deg, transparent, ${meta.color}, transparent)` }}
      />
      <div className="flex items-start gap-3">
        <AgentAvatar agent={agentKey} active={state === "thinking"} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{meta.short}</p>
          <p className="truncate text-[11px] text-muted-foreground">{meta.evaluates.slice(0, 3).join(" · ")}</p>
        </div>
        {opinion ? <VerdictBadge verdict={opinion.verdict} /> : null}
      </div>

      {state === "thinking" && !opinion ? (
        <div className="mt-3 space-y-2">
          <div className="h-2 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-2 w-1/2 animate-pulse rounded bg-muted" />
          <p className="text-[11px] text-primary">Analysing evidence…</p>
        </div>
      ) : null}

      {state === "idle" && !opinion ? (
        <p className="mt-3 text-[11px] text-muted-foreground">Waiting for the floor…</p>
      ) : null}

      {opinion ? (
        <>
          <p className="mt-3 line-clamp-2 text-xs text-foreground/85">{opinion.headline}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
            <Meter label="Score" value={opinion.score} color={meta.color} />
            <Meter label="Confidence" value={opinion.confidence} color={meta.color} />
          </div>
          <p className="mt-3 flex items-center gap-1 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            Open reasoning <ArrowRight className="h-3 w-3" />
          </p>
        </>
      ) : null}
    </button>
  );
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
  );
}

/* ---------------- Debate turn ---------------- */

export function DebateBubble({ turn }: { turn: DebateTurn }) {
  const meta = AGENT_BY_KEY[turn.agent];
  const target = turn.target ? AGENT_BY_KEY[turn.target] : null;
  const stanceTone: Record<DebateTurn["stance"], PillTone> = {
    challenge: "danger",
    support: "success",
    concede: "warning",
    clarify: "info",
  };
  return (
    <article className="relative rounded-xl border border-border/70 bg-card/50 p-4">
      <div
        className="absolute inset-y-0 left-0 w-0.5 rounded-l-xl"
        style={{ background: meta.color }}
        aria-hidden
      />
      <div className="flex flex-wrap items-center gap-2">
        <AgentAvatar agent={turn.agent} size={28} />
        <span className="text-sm font-semibold">{meta.short}</span>
        {target ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowRight className="h-3 w-3" /> {target.short}
          </span>
        ) : null}
        <Pill tone={stanceTone[turn.stance]}>{turn.stance}</Pill>
        <span className="ml-auto text-[11px] text-muted-foreground">Round {turn.round}</span>
      </div>
      <p className="mt-2.5 flex gap-2 text-sm leading-relaxed text-foreground/90">
        <Quote className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span>{turn.message}</span>
      </p>
      {turn.evidence.length ? <div className="mt-2.5"><EvidenceList evidence={turn.evidence} compact /></div> : null}
      {turn.revised_verdict || typeof turn.revised_confidence === "number" ? (
        <p className="mt-2.5 flex items-center gap-2 text-[11px] text-warning">
          <Check className="h-3 w-3" />
          Position updated
          {turn.revised_verdict ? ` → ${VERDICT_LABEL[turn.revised_verdict]}` : ""}
          {typeof turn.revised_confidence === "number" ? ` · confidence ${turn.revised_confidence}%` : ""}
        </p>
      ) : null}
    </article>
  );
}

/* ---------------- Conflict card ---------------- */

export function ConflictCard({ conflict }: { conflict: Conflict }) {
  const tone: PillTone = conflict.severity === "high" ? "danger" : conflict.severity === "medium" ? "warning" : "info";
  return (
    <article className="rounded-xl border border-warning/30 bg-warning/[0.04] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-warning" />
        <h4 className="text-sm font-semibold">{conflict.topic}</h4>
        <Pill tone={tone}>{conflict.severity} severity</Pill>
        <span className="ml-auto text-[11px] text-muted-foreground">Δ confidence {conflict.confidence_delta}</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {conflict.positions.map((p) => (
          <div key={p.agent} className="rounded-lg border border-border/60 bg-card/60 p-2.5">
            <div className="flex items-center gap-2">
              <AgentAvatar agent={p.agent} size={22} />
              <span className="text-xs font-medium">{AGENT_BY_KEY[p.agent].short}</span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{p.position}</p>
          </div>
        ))}
      </div>
      {conflict.conflicting_evidence.length ? (
        <ul className="mt-3 space-y-1">
          {conflict.conflicting_evidence.map((e, i) => (
            <li key={i} className="flex gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
              {e}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 rounded-lg border border-border/60 bg-background/40 p-2.5 text-xs">
        <span className="font-medium text-foreground">Resolution: </span>
        <span className="text-muted-foreground">{conflict.resolution}</span>
        {conflict.resolved_by ? (
          <span className="text-muted-foreground"> (settled by {AGENT_BY_KEY[conflict.resolved_by].short})</span>
        ) : null}
      </p>
    </article>
  );
}

/* ---------------- Reasoning graph ---------------- */

export function ReasoningGraphView({ graph }: { graph: ReasoningGraph }) {
  const layout = useMemo(() => {
    const w = 720;
    const h = 380;
    const evidence = graph.nodes.filter((n) => n.kind === "evidence");
    const agents = graph.nodes.filter((n) => n.kind === "agent");
    const conflicts = graph.nodes.filter((n) => n.kind === "conflict");
    const pos = new Map<string, { x: number; y: number }>();

    evidence.forEach((n, i) => pos.set(n.id, { x: 70, y: 40 + (i * (h - 80)) / Math.max(1, evidence.length - 1 || 1) }));
    agents.forEach((n, i) => pos.set(n.id, { x: 330, y: 26 + (i * (h - 52)) / Math.max(1, agents.length - 1 || 1) }));
    conflicts.forEach((n, i) => pos.set(n.id, { x: 500, y: 90 + i * 70 }));
    pos.set("decision:final", { x: 650, y: h / 2 });
    return { w, h, pos };
  }, [graph]);

  if (!graph?.nodes?.length) return null;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${layout.w} ${layout.h}`} className="min-w-[680px] w-full" role="img" aria-label="Reasoning graph">
        {graph.edges.map((e, i) => {
          const a = layout.pos.get(e.from);
          const b = layout.pos.get(e.to);
          if (!a || !b) return null;
          const stroke =
            e.kind === "contradicts" ? "var(--destructive)" : e.kind === "supports" ? "var(--success)" : "var(--border)";
          const mid = (a.x + b.x) / 2;
          return (
            <path
              key={i}
              d={`M ${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`}
              fill="none"
              stroke={stroke}
              strokeWidth={Math.max(0.6, Math.min(2.6, e.weight))}
              opacity={e.kind === "informs" ? 0.45 : 0.75}
            />
          );
        })}
        {graph.nodes.map((n) => {
          const p = layout.pos.get(n.id);
          if (!p) return null;
          const agentKey = n.id.startsWith("agent:") ? (n.id.slice(6) as AgentKey) : null;
          const color =
            agentKey && AGENT_BY_KEY[agentKey]
              ? AGENT_BY_KEY[agentKey].color
              : n.kind === "decision"
                ? "var(--primary)"
                : n.kind === "conflict"
                  ? "var(--warning)"
                  : "var(--muted-foreground)";
          const r = n.kind === "decision" ? 26 : n.kind === "agent" ? 9 : 6;
          return (
            <g key={n.id}>
              <circle cx={p.x} cy={p.y} r={r} fill={n.kind === "decision" ? "var(--primary)" : color} opacity={0.85} />
              <text
                x={n.kind === "evidence" ? p.x - 12 : p.x + r + 6}
                y={p.y + 3.5}
                textAnchor={n.kind === "evidence" ? "end" : "start"}
                fontSize={10}
                className="fill-muted-foreground"
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ---------------- Workflow timeline ---------------- */

export function WorkflowTimeline({
  nodes,
  activeNode,
  doneNodes,
}: {
  nodes: ReadonlyArray<{ id: string; label: string; agent: AgentKey | null }>;
  activeNode: string | null;
  doneNodes: Set<string>;
}) {
  return (
    <ol className="flex gap-1.5 overflow-x-auto pb-1">
      {nodes.map((n) => {
        const done = doneNodes.has(n.id);
        const active = activeNode === n.id;
        return (
          <li
            key={n.id}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              done && "border-success/40 bg-success/10 text-success",
              active && "border-primary/60 bg-primary/10 text-primary",
              !done && !active && "border-border/60 text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                done ? "bg-success" : active ? "animate-ping bg-primary" : "bg-muted-foreground/50",
              )}
            />
            {n.label}
          </li>
        );
      })}
    </ol>
  );
}
