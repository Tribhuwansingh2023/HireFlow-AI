import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileText, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState, LoadingPanel, PageHeader, Pill, humanise } from "@/components/ui-kit";
import { errorMessage, recordAudit } from "@/lib/audit";
import { useAuth } from "@/lib/use-auth";
import { EMAIL_KINDS, TEMPLATE_VARIABLES, renderTemplate, usedVariables } from "@/lib/templates";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({
    meta: [
      { title: "Email templates — HireFlow AI" },
      {
        name: "description",
        content: "Reusable recruitment email templates with variable placeholders for invites, rejections and offers.",
      },
      { property: "og:title", content: "Email templates — HireFlow AI" },
      { property: "og:description", content: "Consistent, approved candidate messaging with merge variables." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TemplatesPage,
});

const SAMPLE: Record<string, string> = {
  candidate_name: "Amara Okafor",
  candidate_first_name: "Amara",
  job_title: "Senior Backend Engineer",
  department: "Platform",
  location: "Remote",
  stage: "Interview",
  match_score: "87/100",
  interview_round: "Technical deep dive",
  interview_date: "Tuesday 12 May, 14:00 CET",
  meeting_link: "https://meet.example.com/hireflow",
  salary: "€120,000",
  start_date: "1 July",
  recruiter_name: "Jordan Blake",
  company: "HireFlow",
};

const BLANK = { id: "", name: "", kind: "interview_invite", subject: "", body: "", description: "" };

function TemplatesPage() {
  const qc = useQueryClient();
  const { canWrite } = useAuth();
  const [form, setForm] = useState<typeof BLANK | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["email_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_templates").select("*").order("created_at");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      if (form.name.trim().length < 2) throw new Error("Give the template a name.");
      if (form.subject.trim().length < 3) throw new Error("Add a subject line.");
      if (form.body.trim().length < 20) throw new Error("Add a message body.");
      const { data: userRes } = await supabase.auth.getUser();
      const payload = {
        name: form.name.trim(),
        kind: form.kind,
        subject: form.subject,
        body: form.body,
        description: form.description || null,
      };
      if (form.id) {
        const { error } = await supabase.from("email_templates").update(payload).eq("id", form.id);
        if (error) throw new Error(error.message);
        await recordAudit({
          action: "template.update",
          entity_type: "email_template",
          entity_id: form.id,
          summary: `Updated the “${payload.name}” email template.`,
        });
      } else {
        const { data: row, error } = await supabase
          .from("email_templates")
          .insert({ ...payload, created_by: userRes.user?.id ?? null })
          .select()
          .single();
        if (error) throw new Error(error.message);
        await recordAudit({
          action: "template.create",
          entity_type: "email_template",
          entity_id: row.id,
          summary: `Created the “${payload.name}” email template for ${humanise(payload.kind).toLowerCase()} messages.`,
          details: { variables: usedVariables(payload.subject, payload.body) },
        });
      }
    },
    onSuccess: () => {
      toast.success("Template saved");
      setForm(null);
      qc.invalidateQueries({ queryKey: ["email_templates"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async (t: any) => {
      const { error } = await supabase.from("email_templates").delete().eq("id", t.id);
      if (error) throw new Error(error.message);
      await recordAudit({
        action: "template.delete",
        entity_type: "email_template",
        entity_id: t.id,
        summary: `Deleted the “${t.name}” email template.`,
      });
    },
    onSuccess: () => {
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["email_templates"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader
        eyebrow="Communication"
        title="Email templates"
        description="Write once, reuse everywhere. Placeholders like {{candidate_name}} are filled from the live application when a draft is created, and every send is approved and audited."
        actions={
          canWrite ? (
            <button
              onClick={() => setForm({ ...BLANK })}
              className="focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
              style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
            >
              <Plus className="size-4" />
              New template
            </button>
          ) : (
            <Pill tone="neutral">Read-only access</Pill>
          )
        }
      />

      {isLoading ? (
        <LoadingPanel rows={4} label="Loading templates…" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<FileText className="size-6" />}
          title="No templates yet"
          description="Create an interview invite, rejection and offer template so every candidate message stays on-brand and consistent."
          {...(canWrite
            ? {
                action: (
                  <button
                    onClick={() => setForm({ ...BLANK })}
                    className="focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
                    style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
                  >
                    <Plus className="size-4" />
                    New template
                  </button>
                ),
              }
            : {})}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(data ?? []).map((t: any) => (
            <article key={t.id} className="panel flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-display text-base font-semibold">{t.name}</h2>
                  <p className="truncate text-xs text-muted-foreground">{t.subject}</p>
                </div>
                <Pill tone="accent">{humanise(t.kind)}</Pill>
              </div>
              <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {t.body}
              </p>
              <div className="mt-3 flex flex-wrap gap-1">
                {usedVariables(t.subject, t.body).map((v) => (
                  <span key={v} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px]">
                    {`{{${v}}}`}
                  </span>
                ))}
              </div>
              {canWrite ? (
                <div className="mt-4 flex gap-2 border-t border-border pt-4">
                  <button
                    onClick={() =>
                      setForm({
                        id: t.id,
                        name: t.name,
                        kind: t.kind,
                        subject: t.subject,
                        body: t.body,
                        description: t.description ?? "",
                      })
                    }
                    className="focus-ring flex-1 rounded-lg bg-secondary px-3 py-2 text-xs font-medium hover:bg-surface-2"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove.mutate(t)}
                    aria-label={`Delete ${t.name}`}
                    className="focus-ring rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:border-destructive/50 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {form ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm">
          <div className="glass-panel rise-in my-6 w-full max-w-3xl rounded-2xl p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold">{form.id ? "Edit template" : "New template"}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Insert a placeholder by clicking it — it is replaced with real application data at draft time.
                </p>
              </div>
              <button onClick={() => setForm(null)} className="focus-ring rounded-md p-2" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="tpl-name" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Template name
                </label>
                <input
                  id="tpl-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Technical interview invite"
                  className="focus-ring w-full rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm outline-none"
                />
              </div>
              <div>
                <label htmlFor="tpl-kind" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Used for
                </label>
                <select
                  id="tpl-kind"
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value })}
                  className="focus-ring w-full rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm outline-none"
                >
                  {EMAIL_KINDS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label htmlFor="tpl-subject" className="mb-1.5 mt-4 block text-xs font-medium text-muted-foreground">
              Subject
            </label>
            <input
              id="tpl-subject"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="{{job_title}} at {{company}} — next step"
              className="focus-ring w-full rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm outline-none"
            />

            <label htmlFor="tpl-body" className="mb-1.5 mt-4 block text-xs font-medium text-muted-foreground">
              Body
            </label>
            <textarea
              id="tpl-body"
              rows={10}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder={"Hi {{candidate_first_name}},\n\n…"}
              className="focus-ring w-full resize-y rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm leading-relaxed outline-none"
            />

            <div className="mt-3 flex flex-wrap gap-1.5">
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setForm({ ...form, body: `${form.body}{{${v.key}}}` })}
                  className="focus-ring rounded-md bg-secondary px-2 py-1 font-mono text-[10px] hover:bg-surface-2"
                  title={v.label}
                >
                  {`{{${v.key}}}`}
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-border bg-surface-2/50 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Live preview</p>
              <p className="mt-2 text-sm font-semibold">{renderTemplate(form.subject, SAMPLE) || "(no subject)"}</p>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {renderTemplate(form.body, SAMPLE) || "(empty body)"}
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setForm(null)} className="focus-ring rounded-xl border border-border px-4 py-2.5 text-sm">
                Cancel
              </button>
              <button
                onClick={() => save.mutate()}
                disabled={save.isPending}
                className="focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
                style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
              >
                {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Save template
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
