import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Briefcase, Loader2, Plus, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState, LoadingPanel, PageHeader, Pill, humanise } from "@/components/ui-kit";
import { errorMessage, recordAudit } from "@/lib/audit";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated/jobs/")({
  head: () => ({
    meta: [
      { title: "Job posts — HireFlow AI" },
      { name: "description", content: "Create and manage job posts, requirements and interview loops." },
      { property: "og:title", content: "Job posts — HireFlow AI" },
      { property: "og:description", content: "Create and manage job posts and their hiring pipelines." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JobsPage,
});

const jobSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(120),
  department: z.string().trim().max(80),
  location: z.string().trim().max(80),
  employment_type: z.string(),
  seniority: z.string().trim().max(40),
  description: z.string().trim().min(30, "Add a description of at least 30 characters").max(20000),
  required_skills: z.array(z.string()).min(1, "Add at least one required skill"),
  nice_to_have_skills: z.array(z.string()),
  min_experience_years: z.number().min(0).max(40),
  salary_min: z.number().min(0).max(10_000_000).nullable(),
  salary_max: z.number().min(0).max(10_000_000).nullable(),
  interview_rounds: z.number().min(1).max(8),
});

const EMPTY = {
  title: "",
  department: "",
  location: "",
  employment_type: "full_time",
  seniority: "mid",
  description: "",
  required_skills: "",
  nice_to_have_skills: "",
  min_experience_years: "3",
  salary_min: "",
  salary_max: "",
  interview_rounds: "3",
};

function toList(v: string) {
  return v
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function JobsPage() {
  const qc = useQueryClient();
  const { canWrite } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [query, setQuery] = useState("");

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*, applications(id, stage, status)")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const parsed = jobSchema.safeParse({
        title: form.title,
        department: form.department,
        location: form.location,
        employment_type: form.employment_type,
        seniority: form.seniority,
        description: form.description,
        required_skills: toList(form.required_skills),
        nice_to_have_skills: toList(form.nice_to_have_skills),
        min_experience_years: Number(form.min_experience_years) || 0,
        salary_min: form.salary_min ? Number(form.salary_min) : null,
        salary_max: form.salary_max ? Number(form.salary_max) : null,
        interview_rounds: Number(form.interview_rounds) || 3,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid job details");
      const { data: userRes } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("jobs")
        .insert({ ...parsed.data, created_by: userRes.user?.id ?? null })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await recordAudit({
        action: "job.create",
        entity_type: "job",
        entity_id: data.id,
        job_id: data.id,
        summary: `Created job post “${data.title}” with ${data.interview_rounds} interview rounds.`,
        details: { required_skills: data.required_skills },
      });
      return data;
    },
    onSuccess: () => {
      toast.success("Job post created");
      setForm(EMPTY);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e) => toast.error(errorMessage(e, "Could not create the job post")),
  });

  const toggleStatus = useMutation({
    mutationFn: async (job: { id: string; status: string; title: string }) => {
      const next = job.status === "open" ? "closed" : "open";
      const { error } = await supabase.from("jobs").update({ status: next }).eq("id", job.id);
      if (error) throw new Error(error.message);
      await recordAudit({
        action: "job.status_change",
        entity_type: "job",
        entity_id: job.id,
        job_id: job.id,
        summary: `Job “${job.title}” marked ${next}.`,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const filtered = (jobs ?? []).filter((j: any) =>
    `${j.title} ${j.department ?? ""} ${j.location ?? ""}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        eyebrow="Requisitions"
        title="Job posts"
        description="Each job post defines the scoring rubric the screening agent uses — required skills, experience floor and interview loop depth."
        actions={
          canWrite ? (
            <button
              onClick={() => setOpen(true)}
              className="focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
              style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
            >
              <Plus className="size-4" />
              New job post
            </button>
          ) : (
            <Pill tone="neutral">Read-only access</Pill>
          )
        }
      />

      <div className="mb-5 relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter roles…"
          aria-label="Filter roles"
          className="focus-ring w-full rounded-xl border border-input bg-surface py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary/50"
        />
      </div>

      {isLoading ? (
        <LoadingPanel rows={4} label="Loading job posts…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="size-6" />}
          title={query ? "No roles match that filter" : "No job posts yet"}
          description={
            query
              ? "Try a different search term."
              : "Create your first requisition to unlock resume screening, ranking and interview automation."
          }
          {...(canWrite && !query
            ? {
                action: (
                  <button
                    onClick={() => setOpen(true)}
                    className="focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
                    style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
                  >
                    <Plus className="size-4" />
                    New job post
                  </button>
                ),
              }
            : {})}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((job: any) => {
            const total = job.applications?.length ?? 0;
            const pending = (job.applications ?? []).filter((a: any) => a.status === "pending_review").length;
            return (
              <article key={job.id} className="panel lift rise-in flex flex-col p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-lg font-semibold">{job.title}</h2>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {[job.department, job.location, humanise(job.employment_type)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Pill tone={job.status === "open" ? "success" : "neutral"}>{job.status}</Pill>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {(job.required_skills ?? []).slice(0, 5).map((s: string) => (
                    <span key={s} className="rounded-md bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                      {s}
                    </span>
                  ))}
                  {(job.required_skills ?? []).length > 5 ? (
                    <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                      +{job.required_skills.length - 5}
                    </span>
                  ) : null}
                </div>

                <div className="mt-5 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users className="size-3.5" />
                    {total} candidates
                  </span>
                  {pending > 0 ? <Pill tone="warning">{pending} to review</Pill> : null}
                </div>

                <div className="mt-5 flex items-center gap-2 border-t border-border pt-4">
                  <Link
                    to="/jobs/$jobId"
                    params={{ jobId: job.id }}
                    className="focus-ring flex-1 rounded-lg bg-secondary px-3 py-2 text-center text-xs font-medium transition-colors hover:bg-surface-2"
                  >
                    Open pipeline
                  </Link>
                  {canWrite ? (
                    <button
                      onClick={() => toggleStatus.mutate(job)}
                      className="focus-ring rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      {job.status === "open" ? "Close" : "Reopen"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm">
          <div className="glass-panel rise-in w-full max-w-2xl rounded-2xl p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold">New job post</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  These fields drive the deterministic half of the match score.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="focus-ring rounded-md p-2" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Input label="Job title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="Senior Backend Engineer" />
              <Input label="Department" value={form.department} onChange={(v) => setForm({ ...form, department: v })} placeholder="Platform" />
              <Input label="Location" value={form.location} onChange={(v) => setForm({ ...form, location: v })} placeholder="Remote / Berlin" />
              <Select
                label="Employment type"
                value={form.employment_type}
                onChange={(v) => setForm({ ...form, employment_type: v })}
                options={[
                  ["full_time", "Full time"],
                  ["part_time", "Part time"],
                  ["contract", "Contract"],
                  ["internship", "Internship"],
                ]}
              />
              <Select
                label="Seniority"
                value={form.seniority}
                onChange={(v) => setForm({ ...form, seniority: v })}
                options={[
                  ["junior", "Junior"],
                  ["mid", "Mid"],
                  ["senior", "Senior"],
                  ["staff", "Staff"],
                  ["principal", "Principal"],
                ]}
              />
              <Input label="Minimum experience (years)" type="number" value={form.min_experience_years} onChange={(v) => setForm({ ...form, min_experience_years: v })} />
              <Input label="Salary min" type="number" value={form.salary_min} onChange={(v) => setForm({ ...form, salary_min: v })} placeholder="90000" />
              <Input label="Salary max" type="number" value={form.salary_max} onChange={(v) => setForm({ ...form, salary_max: v })} placeholder="130000" />
              <Input label="Interview rounds" type="number" value={form.interview_rounds} onChange={(v) => setForm({ ...form, interview_rounds: v })} />
              <div className="sm:col-span-2">
                <Input
                  label="Required skills (comma separated)"
                  value={form.required_skills}
                  onChange={(v) => setForm({ ...form, required_skills: v })}
                  placeholder="typescript, postgres, distributed systems"
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  label="Nice-to-have skills (comma separated)"
                  value={form.nice_to_have_skills}
                  onChange={(v) => setForm({ ...form, nice_to_have_skills: v })}
                  placeholder="kubernetes, grpc"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Job description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={6}
                  placeholder="Responsibilities, team context, what success looks like…"
                  className="focus-ring w-full resize-y rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/50"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="focus-ring rounded-xl border border-border px-4 py-2.5 text-sm">
                Cancel
              </button>
              <button
                onClick={() => create.mutate()}
                disabled={create.isPending}
                className="focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
                style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
              >
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Create job post
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring w-full rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
      />
    </div>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring w-full rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/50"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
