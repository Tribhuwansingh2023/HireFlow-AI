/**
 * RecruitGPT — rich result cards rendered inline inside the conversation.
 */
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  FileText,
  Gavel,
  MessageSquareQuote,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

import type { CopilotCard } from "@/lib/recruitgpt";
import { cn } from "@/lib/utils";

function Shell({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rise-in overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-[0_18px_50px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl">
      <header className="flex items-center justify-between gap-3 border-b border-border/50 bg-white/[0.02] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">{icon}</span>
          <h3 className="truncate font-display text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function scoreTone(score: number | null | undefined) {
  if (score == null) return "text-muted-foreground";
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-primary";
  if (score >= 40) return "text-warning";
  return "text-destructive";
}

export function CopilotCardView({ card }: { card: CopilotCard }) {
  switch (card.type) {
    case "candidates":
    case "ranking": {
      const rows = card.rows;
      return (
        <Shell
          title={card.type === "ranking" ? `${card.title} — ${card.job}` : card.title}
          icon={<Sparkles className="size-4" />}
        >
          <ol className="space-y-2">
            {rows.map((r, i) => (
              <li
                key={r.id || r.name}
                className="group flex items-start gap-3 rounded-xl border border-border/50 bg-background/40 p-3 transition hover:border-primary/40"
              >
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {r.id ? (
                      <Link
                        to="/candidates/$candidateId"
                        params={{ candidateId: r.id }}
                        className="truncate font-medium text-foreground hover:text-primary"
                      >
                        {r.name}
                      </Link>
                    ) : (
                      <span className="truncate font-medium text-foreground">{r.name}</span>
                    )}
                    {r.years ? <span className="text-xs text-muted-foreground">{r.years} yrs</span> : null}
                    {r.location ? <span className="text-xs text-muted-foreground">· {r.location}</span> : null}
                  </div>
                  {r.headline ? <p className="truncate text-xs text-muted-foreground">{r.headline}</p> : null}
                  {r.reason ? <p className="mt-1 text-xs text-muted-foreground/90">{r.reason}</p> : null}
                  {(r.matched?.length || r.missing?.length) ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(r.matched ?? []).slice(0, 6).map((s) => (
                        <span key={`m${s}`} className="rounded-md bg-success/12 px-1.5 py-0.5 text-[10px] font-medium text-success">
                          {s}
                        </span>
                      ))}
                      {(r.missing ?? []).slice(0, 4).map((s) => (
                        <span key={`x${s}`} className="rounded-md bg-destructive/12 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                          {s}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn("font-display text-lg font-semibold tabular-nums", scoreTone(r.score))}>
                    {r.score ?? "—"}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">match</p>
                </div>
              </li>
            ))}
          </ol>
        </Shell>
      );
    }

    case "comparison": {
      return (
        <Shell title={card.title} icon={<TrendingUp className="size-4" />}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left">
                  <th className="py-2 pr-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Metric</th>
                  {card.candidates.map((c) => (
                    <th key={c.name} className="py-2 pr-3 font-display text-sm font-semibold text-foreground">
                      {c.name}
                      {c.name === card.winner ? (
                        <BadgeCheck className="ml-1 inline size-4 text-success" aria-label="Recommended" />
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {card.metrics.map((m) => (
                  <tr key={m} className="border-b border-border/30 last:border-0">
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{m}</td>
                    {card.candidates.map((c) => (
                      <td key={c.name + m} className="py-2 pr-3 tabular-nums text-foreground">
                        {c.values[m] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 rounded-xl border border-success/30 bg-success/8 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-success">Recommendation · {card.winner}</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground/90">{card.reason}</p>
          </div>
        </Shell>
      );
    }

    case "twin": {
      const data = card.dna.map((d) => ({ subject: d.label, value: d.value }));
      return (
        <Shell
          title={card.title}
          icon={<BrainCircuit className="size-4" />}
          action={
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Digital Twin Agent</span>
          }
        >
          <div className="grid gap-4 sm:grid-cols-[minmax(0,220px)_1fr]">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={data} outerRadius="72%">
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                  <Radar dataKey="value" stroke="var(--twin-blue, #3B82F6)" fill="var(--twin-blue, #3B82F6)" fillOpacity={0.28} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-2">
              {card.predictions.map((p) => (
                <li key={p.label}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{p.label}</span>
                    <span className={cn("text-sm font-semibold tabular-nums", p.invert ? scoreTone(100 - p.value) : scoreTone(p.value))}>
                      {p.value}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", p.invert ? "bg-destructive/70" : "bg-primary")}
                      style={{ width: `${Math.min(100, p.value)}%` }}
                    />
                  </div>
                  {p.hint ? <p className="mt-1 text-[11px] text-muted-foreground">{p.hint}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        </Shell>
      );
    }

    case "debate": {
      return (
        <Shell
          title={card.title}
          icon={<MessageSquareQuote className="size-4" />}
          action={<span className="text-[11px] text-muted-foreground">{Math.round(card.confidence * 100)}% confidence</span>}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {card.positions.map((p) => (
              <div key={p.agent} className="rounded-xl border border-border/50 bg-background/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">{p.agent}</p>
                  <span className="text-xs tabular-nums text-muted-foreground">{p.score}</span>
                </div>
                <p className="mt-1 text-sm font-medium text-foreground">Backs: {p.stance}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.argument}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-primary/30 bg-primary/8 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Final verdict</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground/90">{card.verdict}</p>
          </div>
        </Shell>
      );
    }

    case "simulation": {
      return (
        <Shell title={`${card.title} — ${card.candidate}`} icon={<Sparkles className="size-4" />}>
          <p className="mb-3 text-xs text-muted-foreground">Scenario: {card.scenario}</p>
          <ul className="space-y-3">
            {card.deltas.map((d) => {
              const delta = d.after - d.before;
              return (
                <li key={d.label}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">{d.label}</span>
                    <span className="tabular-nums text-foreground">
                      {d.before}% → <strong className={delta >= 0 ? "text-success" : "text-destructive"}>{d.after}%</strong>
                      <span className={cn("ml-1", delta >= 0 ? "text-success" : "text-destructive")}>
                        ({delta >= 0 ? "+" : ""}{delta})
                      </span>
                    </span>
                  </div>
                  <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/40" style={{ width: `${d.before}%` }} />
                    <div className="absolute inset-y-0 left-0 rounded-full bg-primary/80" style={{ width: `${d.after}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Shell>
      );
    }

    case "report": {
      return (
        <Shell
          title={card.title}
          icon={<FileText className="size-4" />}
          action={
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-border/60 px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-primary/50 hover:text-primary"
            >
              Export PDF
            </button>
          }
        >
          <div className="space-y-3">
            {card.sections.map((s) => (
              <div key={s.heading} className="rounded-xl border border-border/50 bg-background/40 p-3">
                <p className="font-display text-sm font-semibold text-foreground">{s.heading}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
                {s.bullets?.length ? (
                  <ul className="mt-2 space-y-1">
                    {s.bullets.map((b, i) => (
                      <li key={i} className="flex gap-2 text-xs text-foreground/85">
                        <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-success" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </Shell>
      );
    }

    case "metrics": {
      return (
        <Shell title={card.title} icon={<TrendingUp className="size-4" />}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {card.stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-border/50 bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
                <p className="mt-1 font-display text-xl font-semibold tabular-nums text-foreground">{s.value}</p>
                {s.hint ? <p className="text-[10px] text-muted-foreground">{s.hint}</p> : null}
              </div>
            ))}
          </div>
        </Shell>
      );
    }

    case "questions": {
      return (
        <Shell title={card.title} icon={<MessageSquareQuote className="size-4" />}>
          <ol className="space-y-2">
            {card.items.map((q, i) => (
              <li key={i} className="rounded-xl border border-border/50 bg-background/40 p-3">
                <p className="text-sm font-medium text-foreground">
                  {i + 1}. {q.question}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  {q.competency ? <span>Competency: {q.competency}</span> : null}
                  {q.why ? <span>Why: {q.why}</span> : null}
                  {q.signal ? <span>Strong answer: {q.signal}</span> : null}
                </div>
              </li>
            ))}
          </ol>
        </Shell>
      );
    }

    case "action": {
      return (
        <Shell
          title={card.title}
          icon={card.status === "done" ? <Gavel className="size-4" /> : <Clock3 className="size-4" />}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-foreground/90">{card.detail}</p>
            {card.link ? (
              <a
                href={card.link}
                className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary/10"
              >
                Open <ArrowRight className="size-3" />
              </a>
            ) : null}
          </div>
          <p className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            {card.status === "done" ? "Executed and written to the audit trail" : "Draft — human approval required"}
          </p>
        </Shell>
      );
    }

    default:
      return null;
  }
}
