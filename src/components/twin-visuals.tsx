/**
 * Digital Twin visual primitives — radar, gauges, bars and timelines.
 * Presentation only: every number arrives from a persisted AI inference.
 */
import { useEffect, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

export const clamp = (n: unknown, lo = 0, hi = 100) =>
  Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));

/** Colour band for a score. `invert` treats high values as bad (risk metrics). */
export function toneFor(value: number, invert = false): string {
  const v = invert ? 100 - value : value;
  if (v >= 75) return "var(--success)";
  if (v >= 55) return "var(--twin-cyan)";
  if (v >= 40) return "var(--warning)";
  return "var(--destructive)";
}

/** Counts up to `value` once mounted so every figure animates in. */
export function useCountUp(value: number, duration = 800): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return n;
}

export function TwinRadar({
  data,
}: {
  data: Array<{ dimension: string; score: number; confidence: number }>;
}) {
  return (
    <div className="h-[340px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="76%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="Confidence"
            dataKey="confidence"
            stroke="var(--twin-violet)"
            strokeDasharray="4 4"
            fill="var(--twin-violet)"
            fillOpacity={0.08}
            isAnimationActive
            animationDuration={900}
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke="var(--twin-blue)"
            strokeWidth={2}
            fill="var(--twin-cyan)"
            fillOpacity={0.22}
            isAnimationActive
            animationDuration={1100}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Semicircular gauge used for burnout, risk and acceptance metrics. */
export function Gauge({
  value,
  label,
  caption,
  invert = false,
  size = 148,
}: {
  value: number;
  label: string;
  caption?: string;
  invert?: boolean;
  size?: number;
}) {
  const v = clamp(value);
  const shown = useCountUp(v);
  const r = size / 2 - 12;
  const circumference = Math.PI * r;
  const offset = circumference * (1 - shown / 100);
  const color = toneFor(v, invert);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`} role="img" aria-label={`${label}: ${v}%`}>
        <path
          d={`M 12 ${size / 2} A ${r} ${r} 0 0 1 ${size - 12} ${size / 2}`}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={11}
          strokeLinecap="round"
        />
        <path
          d={`M 12 ${size / 2} A ${r} ${r} 0 0 1 ${size - 12} ${size / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
        <text
          x={size / 2}
          y={size / 2 - 6}
          textAnchor="middle"
          className="font-display"
          style={{ fill: "var(--foreground)", fontSize: 22, fontWeight: 600 }}
        >
          {shown}%
        </text>
      </svg>
      <p className="mt-1 text-center text-xs font-medium">{label}</p>
      {caption ? <p className="mt-0.5 text-center text-[11px] text-muted-foreground">{caption}</p> : null}
    </div>
  );
}

/** Horizontal meter with an optional projected value (skill evolution). */
export function MetricBar({
  label,
  value,
  projected,
  invert = false,
  suffix = "%",
  note,
}: {
  label: string;
  value: number;
  projected?: number;
  invert?: boolean;
  suffix?: string;
  note?: string;
}) {
  const v = clamp(value);
  const p = projected === undefined ? undefined : clamp(projected);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-muted-foreground">
          {v}
          {suffix}
          {p !== undefined ? (
            <>
              {" → "}
              <span style={{ color: "var(--twin-cyan)" }}>
                {p}
                {suffix}
              </span>
            </>
          ) : null}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
        {p !== undefined ? (
          <div className="relative h-full">
            <div
              className="twin-grow absolute inset-y-0 left-0 rounded-full opacity-40"
              style={{ width: `${p}%`, backgroundImage: "var(--gradient-twin)" }}
            />
            <div
              className="twin-grow absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${v}%`, background: toneFor(v, invert) }}
            />
          </div>
        ) : (
          <div
            className="twin-grow h-full rounded-full"
            style={{ width: `${v}%`, background: toneFor(v, invert) }}
          />
        )}
      </div>
      {note ? <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export function ConfidenceChip({ value }: { value: number }) {
  const v = clamp(value);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{ borderColor: `color-mix(in oklab, ${toneFor(v)} 45%, transparent)`, color: toneFor(v) }}
    >
      <span className="size-1.5 rounded-full" style={{ background: toneFor(v) }} />
      {v}% confidence
    </span>
  );
}

export function SectionTitle({
  title,
  description,
  right,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {right}
    </div>
  );
}
