import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { History, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { Pill, humanise } from "@/components/ui-kit";
import { errorMessage, recordAudit } from "@/lib/audit";
import { Input, Select } from "@/routes/_authenticated/jobs/index";

const jobSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(120),
  description: z.string().trim().min(30, "Add a description of at least 30 characters").max(20000),
  required_skills: z.array(z.string()).min(1, "Add at least one required skill"),
  min_experience_years: z.number().min(0).max(40),
  interview_rounds: z.number().min(1).max(8),
});

const toList = (v: string) =>
  v
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export function JobEditor({ job, onClose }: { job: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: job.title ?? "",
    department: job.department ?? "",
    location: job.location ?? "",
    employment_type: job.employment_type ?? "full_time",
    seniority: job.seniority ?? "mid",
    description: job.description ?? "",
    required_skills: (job.required_skills ?? []).join(", "),
    nice_to_have_skills: (job.nice_to_have_skills ?? []).join(", "),
    min_experience_years: String(job.min_experience_years ?? 0),
    salary_min: job.salary_min == null ? "" : String(job.salary_min),
    salary_max: job.salary_max == null ? "" : String(job.salary_max),
    interview_rounds: String(job.interview_rounds ?? 3),
  });
  const [changeNote, setChangeNote] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        department: form.department.trim() || null,
        location: form.location.trim() || null,
        employment_type: form.employment_type,
        seniority: form.seniority,
        description: form.description.trim(),
        required_skills: toList(form.required_skills),
        nice_to_have_skills: toList(form.nice_to_have_skills),
        min_experience_years: Number(form.min_experience_years) || 0,
        salary_min: form.salary_min ? Number(form.salary_min) : null,
        salary_max: form.salary_max ? Number(form.salary_max) : null,
        interview_rounds: Number(form.interview_rounds) || 3,
      };
      const parsed = jobSchema.safeParse(payload);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid job details");

      const { data: updated, error } = await supabase
        .from("jobs")
        .update(payload)
        .eq("id", job.id)
        .select()
        .single();
      if (error) throw new Error(error.message);

      // Attach the recruiter's change note to the version the trigger just created.
      const { data: version } = await supabase
        .from("job_versions")
        .select("id, version")
        .eq("job_id", job.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (version?.id && changeNote.trim()) {
        await supabase.from("job_versions").update({ change_summary: changeNote.trim() }).eq("id", version.id);
      }

      await recordAudit({
        action: "job.update",
        entity_type: "job",
        entity_id: job.id,
        job_id: job.id,
        summary: `Edited job post “${updated.title}” — saved as version ${version?.version ?? updated.current_version}${changeNote.trim() ? `: ${changeNote.trim()}` : "."}`,
        details: { version: version?.version, required_skills: payload.required_skills },
      });

      return version?.version ?? updated.current_version;
    },
    onSuccess: (v) => {
      toast.success(`Saved as version ${v} — future screening runs use this description`);
      qc.invalidateQueries({ queryKey: ["job", job.id] });
      qc.invalidateQueries({ queryKey: ["job_versions", job.id] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm">
      <div className="glass-panel rise-in my-6 w-full max-w-2xl rounded-2xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Edit job post</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Saving creates version {(job.current_version ?? 1) + 1}. Existing scores stay tied to the version they
              were produced against.
            </p>
          </div>
          <button onClick={onClose} className="focus-ring rounded-md p-2" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Input label="Job title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
          <Input label="Department" value={form.department} onChange={(v) => setForm({ ...form, department: v })} />
          <Input label="Location" value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
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
          <Input
            label="Minimum experience (years)"
            type="number"
            value={form.min_experience_years}
            onChange={(v) => setForm({ ...form, min_experience_years: v })}
          />
          <Input label="Salary min" type="number" value={form.salary_min} onChange={(v) => setForm({ ...form, salary_min: v })} />
          <Input label="Salary max" type="number" value={form.salary_max} onChange={(v) => setForm({ ...form, salary_max: v })} />
          <Input
            label="Interview rounds"
            type="number"
            value={form.interview_rounds}
            onChange={(v) => setForm({ ...form, interview_rounds: v })}
          />
          <div className="sm:col-span-2">
            <Input
              label="Required skills (comma separated)"
              value={form.required_skills}
              onChange={(v) => setForm({ ...form, required_skills: v })}
            />
          </div>
          <div className="sm:col-span-2">
            <Input
              label="Nice-to-have skills (comma separated)"
              value={form.nice_to_have_skills}
              onChange={(v) => setForm({ ...form, nice_to_have_skills: v })}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="job-desc" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Job description
            </label>
            <textarea
              id="job-desc"
              rows={8}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="focus-ring w-full resize-y rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <Input
              label="What changed? (recorded on this version)"
              value={changeNote}
              onChange={setChangeNote}
              placeholder="Dropped the Kubernetes requirement, raised the experience floor"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="focus-ring rounded-xl border border-border px-4 py-2.5 text-sm">
            Cancel
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
            style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save new version
          </button>
        </div>
      </div>
    </div>
  );
}

export function JobVersionHistory({ jobId, currentVersion }: { jobId: string; currentVersion: number }) {
  const [open, setOpen] = useState<any | null>(null);
  const { data } = useQuery({
    queryKey: ["job_versions", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_versions")
        .select("*")
        .eq("job_id", jobId)
        .order("version", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const versions = data ?? [];

  return (
    <section className="panel mb-6 overflow-hidden">
      <div className="hairline flex items-center gap-2 px-5 py-4">
        <History className="size-4 text-accent" />
        <h2 className="font-display text-sm font-semibold">Job description history ({versions.length})</h2>
        <Pill tone="accent">Live version v{currentVersion}</Pill>
      </div>
      <ul className="divide-y divide-border">
        {versions.map((v: any) => (
          <li key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <span className="font-mono text-xs text-muted-foreground">v{v.version}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{v.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {v.change_summary} · {new Date(v.created_at).toLocaleString()} · {(v.required_skills ?? []).length}{" "}
                required skills · {v.min_experience_years}y minimum
              </p>
            </div>
            {v.version === currentVersion ? <Pill tone="success">Current</Pill> : null}
            <button
              onClick={() => setOpen(v)}
              className="focus-ring rounded-lg bg-secondary px-3 py-1.5 text-xs hover:bg-surface-2"
            >
              View
            </button>
          </li>
        ))}
      </ul>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm">
          <div className="glass-panel rise-in my-6 w-full max-w-2xl rounded-2xl p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg font-semibold">
                  {open.title} — v{open.version}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {open.change_summary} · captured {new Date(open.created_at).toLocaleString()}
                </p>
              </div>
              <button onClick={() => setOpen(null)} className="focus-ring rounded-md p-2" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Seniority / type</dt>
                <dd>
                  {humanise(open.seniority ?? "—")} · {humanise(open.employment_type ?? "—")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Experience floor</dt>
                <dd>{open.min_experience_years} years</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Required skills</dt>
                <dd>{(open.required_skills ?? []).join(", ") || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Nice to have</dt>
                <dd>{(open.nice_to_have_skills ?? []).join(", ") || "—"}</dd>
              </div>
            </dl>
            <p className="mt-4 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-surface-2/50 p-4 text-xs leading-relaxed">
              {open.description}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
