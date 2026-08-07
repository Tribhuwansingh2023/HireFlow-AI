import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, PolarRadiusAxis } from "recharts";

import { NEGATIVE_METRICS, RECOMMENDATION_LABEL, type Recommendation } from "@/lib/interview";
import { cn } from "@/lib/utils";

export function metricTone(key: string, value: number) {
  const good = NEGATIVE_METRICS.has(key) ? 100 - value : value;
  if (good >= 75) return "text-emerald-300";
  if (good >= 55) return "text-[color:var(--twin-cyan)]";
  if (good >= 40) return "text-amber-300";
  return "text-rose-300";
}

function barColor(key: string, value: number) {
  const good = NEGATIVE_METRICS.has(key) ? 100 - value : value;
  if (good >= 75) return "bg-emerald-400/80";
  if (good >= 55) return "bg-[color:var(--twin-cyan)]/80";
  if (good >= 40) return "bg-amber-400/80";
  return "bg-rose-400/80";
}

export function MetricBar({
  label,
  value,
  hint,
  compact,
}: {
  label: string;
  value: number;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>{label}</span>
        <span className={cn("font-mono tabular-nums", compact ? "text-[11px]" : "text-xs", metricTone(label, value))}>
          {Math.round(value)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className={cn("h-full rounded-full transition-all duration-700", barColor(label, value))}
          style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        />
      </div>
      {hint ? <p className="text-[11px] leading-snug text-muted-foreground/70">{hint}</p> : null}
    </div>
  );
}

export function SignalGrid({
  title,
  data,
  columns = 2,
}: {
  title: string;
  data: Record<string, number> | undefined;
  columns?: number;
}) {
  const entries = Object.entries(data ?? {}).filter(([, v]) => typeof v === "number");
  if (!entries.length) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <p className="text-xs font-medium text-foreground/80">{title}</p>
        <p className="mt-2 text-[11px] text-muted-foreground">No readings captured yet.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <p className="mb-3 text-xs font-medium tracking-wide text-foreground/80 uppercase">{title}</p>
      <div className={cn("grid gap-3", columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
        {entries.map(([k, v]) => (
          <MetricBar key={k} label={k} value={v} compact />
        ))}
      </div>
    </div>
  );
}

export function CompetencyRadar({ entries }: { entries: Array<{ key: string; value: number }> }) {
  if (!entries.length) return null;
  const data = entries.map((e) => ({ subject: e.key, value: e.value }));
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="rgba(255,255,255,0.08)" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 10 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            dataKey="value"
            stroke="var(--twin-cyan)"
            fill="var(--twin-blue)"
            fillOpacity={0.32}
            strokeWidth={2}
            isAnimationActive
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function EmotionStrip({ emotion }: { emotion: Record<string, number> | undefined }) {
  const entries = Object.entries(emotion ?? {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {entries.slice(0, 6).map(([k, v]) => (
        <span
          key={k}
          className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] tracking-wide text-foreground/75 capitalize"
        >
          {k} <span className="font-mono text-muted-foreground">{Math.round(v)}</span>
        </span>
      ))}
    </div>
  );
}

export function FeedbackChip({ text }: { text: string }) {
  const lower = text.toLowerCase();
  const negative = /slow|fast|filler|nervous|vague|unclear|avoid|weak|shallow|too |lack/.test(lower);
  return (
    <span
      className={cn(
        "animate-in fade-in slide-in-from-bottom-1 rounded-lg border px-3 py-1.5 text-xs backdrop-blur",
        negative
          ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
          : "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
      )}
    >
      {text}
    </span>
  );
}

export function RecommendationBadge({
  decision,
  confidence,
}: {
  decision: Recommendation | string | null | undefined;
  confidence?: number | null;
}) {
  const key = (decision ?? "hold") as Recommendation;
  const tone: Record<string, string> = {
    strong_hire: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    hire: "border-[color:var(--twin-cyan)]/30 bg-[color:var(--twin-cyan)]/10 text-[color:var(--twin-cyan)]",
    hold: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    reject: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  };
  return (
    <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", tone[key] ?? tone["hold"])}>
      {RECOMMENDATION_LABEL[key] ?? "Hold"}
      {typeof confidence === "number" ? ` · ${Math.round(confidence)}% confidence` : ""}
    </span>
  );
}

export function HeatmapStrip({
  points,
  onSelect,
}: {
  points: Array<{ turn_index: number; label: string; kind: string; score: number; note: string }>;
  onSelect?: (turnIndex: number) => void;
}) {
  if (!points.length) return null;
  const tone: Record<string, string> = {
    exceptional: "from-emerald-400/70 to-emerald-400/20",
    excelled: "from-[color:var(--twin-cyan)]/70 to-[color:var(--twin-cyan)]/15",
    struggled: "from-amber-400/70 to-amber-400/15",
    nervous: "from-rose-400/70 to-rose-400/15",
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {points.map((p) => (
        <button
          key={`${p.turn_index}-${p.label}`}
          type="button"
          onClick={() => onSelect?.(p.turn_index)}
          className="group rounded-xl border border-white/8 bg-white/[0.02] p-3 text-left transition hover:border-white/20"
        >
          <div className={cn("mb-2 h-1.5 w-full rounded-full bg-gradient-to-r", tone[p.kind] ?? tone["excelled"])} />
          <p className="text-xs font-medium text-foreground/85">
            Q{p.turn_index + 1} · {p.label}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{p.note}</p>
          <p className="mt-2 font-mono text-[11px] text-muted-foreground/70">{Math.round(p.score)}/100</p>
        </button>
      ))}
    </div>
  );
}

export function WaveMeter({ level, active }: { level: number; active: boolean }) {
  const bars = 28;
  return (
    <div className="flex h-10 items-end gap-[3px]">
      {Array.from({ length: bars }).map((_, i) => {
        const wave = active ? Math.max(6, level * (0.45 + 0.55 * Math.abs(Math.sin((i / bars) * Math.PI * 2)))) : 4;
        return (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-full transition-all duration-150",
              active ? "bg-[color:var(--twin-cyan)]" : "bg-white/12",
            )}
            style={{ height: `${Math.min(100, wave)}%` }}
          />
        );
      })}
    </div>
  );
}
