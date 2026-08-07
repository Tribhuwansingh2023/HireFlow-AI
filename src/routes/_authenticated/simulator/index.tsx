import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Cpu, Radio, Sparkles, Video } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState, LoadingPanel, PageHeader, Pill, StatCard } from "@/components/ui-kit";
import { RecommendationBadge } from "@/components/interview-visuals";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COMPANY_TYPES, DIFFICULTIES, ROUND_LABEL, ROUND_TYPES } from "@/lib/interview";

export const Route = createFileRoute("/_authenticated/simulator/")({
  head: () => ({
    meta: [
      { title: "AI Interview Simulator — HireFlow AI" },
      {
        name: "description",
        content:
          "Run adaptive AI mock interviews with multimodal voice, facial and body-language analysis, live scoring and auditable executive reports.",
      },
      { property: "og:title", content: "AI Interview Simulator — HireFlow AI" },
      {
        property: "og:description",
        content: "Adaptive AI interviews with multimodal scoring and auditable hiring recommendations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SimulatorIndex,
});

function SimulatorIndex() {
  const [query, setQuery] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["simulator-index"],
    queryFn: async () => {
      const [{ data: sessions, error }, { data: applications, error: aErr }] = await Promise.all([
        supabase
          .from("interview_sessions")
          .select("*, candidate:candidates(id, full_name, headline), job:jobs(id, title)")
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("applications")
          .select("id, stage, status, match_score, candidate:candidates(id, full_name), job:jobs(id, title)")
          .order("match_score", { ascending: false, nullsFirst: false })
          .limit(120),
      ]);
      if (error) throw error;
      if (aErr) throw aErr;
      return { sessions: sessions ?? [], applications: applications ?? [] };
    },
  });

  const sessions = data?.sessions ?? [];
  const stats = useMemo(() => {
    const completed = sessions.filter((s: any) => s.status === "completed");
    const scored = completed.filter((s: any) => typeof s.overall_score === "number");
    return {
      total: sessions.length,
      completed: completed.length,
      live: sessions.filter((s: any) => s.status === "in_progress").length,
      avg: scored.length
        ? Math.round(scored.reduce((a: number, s: any) => a + Number(s.overall_score), 0) / scored.length)
        : 0,
    };
  }, [sessions]);

  const filtered = sessions.filter((s: any) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${s.candidate?.full_name ?? ""} ${s.job?.title ?? ""} ${s.round_type}`.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Multimodal assessment"
        title="AI Interview Simulator"
        description="Adaptive AI interviews that evaluate technical depth, communication, confidence and behaviour from live voice, video and transcript evidence — every score pinned to the evidence that produced it."
        actions={<NewSessionDialog applications={data?.applications ?? []} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Simulations run"
          value={stats.total}
          icon={<Video className="size-4" />}
          hint="All rounds, all candidates"
        />
        <StatCard
          label="Completed reports"
          value={stats.completed}
          tone="success"
          icon={<Cpu className="size-4" />}
          hint="Executive summaries generated"
        />
        <StatCard
          label="Live now"
          value={stats.live}
          tone="warning"
          icon={<Radio className="size-4" />}
          hint="Interviews in progress"
        />
        <StatCard
          label="Average score"
          value={stats.avg}
          tone="primary"
          icon={<Activity className="size-4" />}
          hint="Across scored interviews"
        />
      </div>

      <div className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Session history</h2>
            <p className="text-xs text-muted-foreground">
              Every interview is fully replayable: questions, transcripts, signals and scores.
            </p>
          </div>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search candidate, role or round…"
            className="max-w-xs"
          />
        </div>

        {isLoading ? (
          <LoadingPanel rows={4} label="Loading interview sessions" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="size-6" />}
            title="No interviews simulated yet"
            description="Pick a screened candidate and run an adaptive AI interview round. The report feeds straight into the audit trail and Digital Twin."
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((s: any) => (
              <Link
                key={s.id}
                to="/simulator/$sessionId"
                params={{ sessionId: s.id }}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3 transition hover:border-primary/40 hover:bg-card/70"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {s.candidate?.full_name ?? "Candidate"}
                    <span className="ml-2 text-xs text-muted-foreground">{s.job?.title ?? "No role linked"}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Round {s.round_number} · {ROUND_LABEL[s.round_type as keyof typeof ROUND_LABEL] ?? s.round_type} ·{" "}
                    {s.difficulty} · {new Date(s.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {typeof s.overall_score === "number" ? (
                    <span className="font-mono text-sm text-foreground/85">{Math.round(s.overall_score)}/100</span>
                  ) : null}
                  {s.recommendation ? (
                    <RecommendationBadge decision={s.recommendation} confidence={s.recommendation_confidence} />
                  ) : (
                    <Pill tone={s.status === "in_progress" ? "amber" : "neutral"}>
                      {s.status === "in_progress" ? "In progress" : "Device check"}
                    </Pill>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Assessments never consider protected attributes. Every question, answer and score is written to the immutable
        audit trail with the model version used.{" "}
        <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
          Refresh
        </button>
      </p>
    </div>
  );
}

function NewSessionDialog({ applications }: { applications: any[] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [applicationId, setApplicationId] = useState("");
  const [roundType, setRoundType] = useState("technical");
  const [difficulty, setDifficulty] = useState("standard");
  const [companyType, setCompanyType] = useState("product");
  const [planned, setPlanned] = useState(6);

  const app = applications.find((a) => a.id === applicationId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Video className="size-4" /> New interview
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure interview round</DialogTitle>
          <DialogDescription>
            The AI interviewer reads the pinned job description version, the resume and the screening result before it
            writes the first question.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Candidate</Label>
            <Select value={applicationId} onValueChange={setApplicationId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a screened candidate" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {applications.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.candidate?.full_name ?? "Candidate"} — {a.job?.title ?? "role"}
                    {typeof a.match_score === "number" ? ` (${Math.round(a.match_score)})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Round type</Label>
              <Select value={roundType} onValueChange={setRoundType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROUND_TYPES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROUND_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTIES.map((d) => (
                    <SelectItem key={d} value={d} className="capitalize">
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Company style</Label>
              <Select value={companyType} onValueChange={setCompanyType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_TYPES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Questions</Label>
              <Input
                type="number"
                min={3}
                max={15}
                value={planned}
                onChange={(e) => setPlanned(Number(e.target.value))}
              />
            </div>
          </div>

          <Button
            className="w-full"
            disabled={!app}
            onClick={() => {
              if (!app) return;
              setOpen(false);
              void navigate({
                to: "/simulator/new",
                search: {
                  candidateId: app.candidate?.id as string,
                  applicationId: app.id as string,
                  roundType,
                  difficulty,
                  companyType,
                  planned,
                },
              });
            }}
          >
            Continue to device check
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
