import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ---------------- Page heading ---------------- */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">{eyebrow}</p>
        ) : null}
        <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ---------------- Stat card ---------------- */

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "primary" | "accent" | "success" | "warning";
}) {
  const toneRing: Record<string, string> = {
    default: "text-muted-foreground bg-muted",
    primary: "text-primary bg-primary/12",
    accent: "text-accent bg-accent/12",
    success: "text-success bg-success/12",
    warning: "text-warning bg-warning/12",
  };
  return (
    <div className="panel lift rise-in p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        {icon ? (
          <span className={cn("grid size-9 place-items-center rounded-lg", toneRing[tone])}>{icon}</span>
        ) : null}
      </div>
      <p className="mt-3 font-display text-3xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* ---------------- Empty state ---------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon ? (
        <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span>
      ) : null}
      <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* ---------------- Loading ---------------- */

export function LoadingPanel({ rows = 4, label }: { rows?: number; label?: string }) {
  return (
    <div className="panel space-y-3 p-5" aria-busy="true" aria-live="polite">
      {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="shimmer h-11 rounded-lg bg-muted/60" />
      ))}
    </div>
  );
}

/* ---------------- Score ring ---------------- */

export function ScoreRing({ score, size = 64 }: { score: number | null | undefined; size?: number }) {
  const value = Math.max(0, Math.min(100, Math.round(score ?? 0)));
  const stroke = size < 56 ? 5 : 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = value >= 75 ? "var(--success)" : value >= 50 ? "var(--primary)" : "var(--destructive)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--border)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tone}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (value / 100) * c}
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-display text-sm font-semibold tabular-nums" style={{ color: tone }}>
          {score === null || score === undefined ? "—" : value}
        </span>
      </div>
    </div>
  );
}

/* ---------------- Status pill ---------------- */

const PILL_TONES: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  primary: "bg-primary/12 text-primary border-primary/30",
  accent: "bg-accent/12 text-accent border-accent/30",
  success: "bg-success/12 text-success border-success/30",
  warning: "bg-warning/12 text-warning border-warning/30",
  danger: "bg-destructive/12 text-destructive border-destructive/30",
  info: "bg-info/12 text-info border-info/30",
};

export type PillTone = keyof typeof PILL_TONES;

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: PillTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize",
        PILL_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const STAGE_TONE: Record<string, PillTone> = {
  screening: "info",
  shortlisted: "primary",
  interviewing: "accent",
  offer: "warning",
  hired: "success",
  rejected: "danger",
};

export const STATUS_TONE: Record<string, PillTone> = {
  pending_review: "warning",
  approved: "success",
  rejected: "danger",
  on_hold: "neutral",
  draft: "neutral",
  sent: "success",
  scheduled: "info",
  completed: "success",
  cancelled: "danger",
  pending: "warning",
};

export function humanise(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ");
}

/* ---------------- Inline alert ---------------- */

export function InlineAlert({
  tone = "warning",
  title,
  children,
}: {
  tone?: "warning" | "danger" | "info" | "success";
  title: string;
  children?: ReactNode;
}) {
  const map = {
    warning: "border-warning/35 bg-warning/8 text-warning",
    danger: "border-destructive/35 bg-destructive/8 text-destructive",
    info: "border-info/35 bg-info/8 text-info",
    success: "border-success/35 bg-success/8 text-success",
  } as const;
  return (
    <div className={cn("rounded-xl border px-4 py-3", map[tone])} role="status">
      <p className="text-sm font-semibold">{title}</p>
      {children ? <div className="mt-1 text-xs leading-relaxed opacity-90">{children}</div> : null}
    </div>
  );
}
