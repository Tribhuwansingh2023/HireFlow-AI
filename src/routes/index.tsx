import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BrainCircuit,
  CalendarClock,
  FileSearch,
  Gavel,
  ScanLine,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HireFlow AI — Human-in-the-Loop Recruitment Automation" },
      {
        name: "description",
        content:
          "An agentic ATS that screens resumes, ranks candidates with explainable scoring, schedules interviews and logs every AI decision for audit.",
      },
      { property: "og:title", content: "HireFlow AI — Human-in-the-Loop Recruitment Automation" },
      {
        property: "og:description",
        content:
          "Resume parsing with OCR, explainable ranking, interview generation, approval gates and a complete audit trail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const STEPS = [
  { icon: ScanLine, title: "Ingest", body: "PDF, DOCX and scanned resumes parsed into structured profiles with OCR fallback and duplicate detection." },
  { icon: BrainCircuit, title: "Screen", body: "A hybrid agent scores every candidate: deterministic rules plus embedding similarity, narrated in plain English." },
  { icon: ShieldCheck, title: "Approve", body: "Nothing moves without a human. Approve, reject, re-rank or comment — every override is captured." },
  { icon: CalendarClock, title: "Interview", body: "Multi-round scheduling, generated meeting links and question guides built from the JD and the resume." },
  { icon: Gavel, title: "Offer", body: "Multi-level offer approvals with drafted, human-approved candidate communications." },
  { icon: ScrollText, title: "Audit", body: "Every agent decision and human override is written to an immutable, filterable trail." },
];

const FEATURES = [
  { icon: FileSearch, title: "Semantic talent search", body: "Ask for “senior Rust engineer with payments experience” and search meaning, not keywords." },
  { icon: Workflow, title: "Explainable ranking", body: "Weighted component scores with per-component rationale — never an opaque number." },
  { icon: Users, title: "Role-based access", body: "Administrators, recruiters, hiring managers and viewers with database-enforced permissions." },
  { icon: Sparkles, title: "Recruiter copilot", body: "A chat assistant grounded in your live pipeline data, not generic advice." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 -z-10 aurora-bg" />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <span
            className="grid size-9 place-items-center rounded-xl text-sm font-bold"
            style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
          >
            HF
          </span>
          <span className="font-display text-base font-semibold">HireFlow AI</span>
        </div>
        <Link
          to="/auth"
          className="focus-ring rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium transition-colors hover:border-primary/50"
        >
          Sign in
        </Link>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-12 sm:pt-20">
        <div className="rise-in max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="size-3" />
            Track A · Business process automation
          </span>
          <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.08] sm:text-6xl">
            Recruitment that runs itself —{" "}
            <span className="text-gradient">under human command.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            HireFlow AI automates the eleven manual steps between a job post and a signed offer, while keeping a
            recruiter in control of every consequential decision. Traceable, explainable, auditable.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              to="/auth"
              className="focus-ring group inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5"
              style={{
                backgroundImage: "var(--gradient-primary)",
                color: "var(--primary-foreground)",
                boxShadow: "var(--shadow-glow)",
              }}
            >
              Launch the workspace
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#workflow"
              className="focus-ring rounded-xl border border-border bg-surface px-6 py-3 text-sm font-medium transition-colors hover:border-primary/40"
            >
              See the workflow
            </a>
          </div>
        </div>

        <dl className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            ["11", "automated workflow stages"],
            ["100%", "AI decisions logged & reversible"],
            ["0", "candidates advanced without approval"],
          ].map(([value, label]) => (
            <div key={label} className="panel p-6">
              <dt className="font-display text-3xl font-semibold text-gradient">{value}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{label}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="workflow" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">The agentic pipeline</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Six stages, each with an explicit hand-off between the agent and the human who owns the outcome.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <article key={step.title} className="panel lift p-6">
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary">
                  <step.icon className="size-5" />
                </span>
                <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <article key={f.title} className="panel flex gap-4 p-6">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
                <f.icon className="size-5" />
              </span>
              <div>
                <h3 className="font-display text-base font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-12 text-xs text-muted-foreground hairline">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-8">
          <span>© {new Date().getFullYear()} HireFlow AI — built for auditable hiring.</span>
          <Link to="/auth" className="focus-ring rounded text-foreground hover:text-primary">
            Sign in →
          </Link>
        </div>
      </footer>
    </div>
  );
}
