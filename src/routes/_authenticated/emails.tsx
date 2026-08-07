import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Mail, Send, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState, LoadingPanel, PageHeader, Pill, humanise } from "@/components/ui-kit";
import { errorMessage, recordAudit } from "@/lib/audit";
import { renderTemplate, unresolvedVariables, varsForApplication } from "@/lib/templates";
import { useAuth } from "@/lib/use-auth";


export const Route = createFileRoute("/_authenticated/emails")({
  head: () => ({
    meta: [
      { title: "Candidate emails — HireFlow AI" },
      { name: "description", content: "Review, edit and approve every AI-drafted candidate email before it is sent." },
      { property: "og:title", content: "Candidate emails — HireFlow AI" },
      { property: "og:description", content: "Human approval gate for all AI-drafted candidate communication." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmailsPage,
});

function EmailsPage() {
  const qc = useQueryClient();
  const { canWrite } = useAuth();
  const [open, setOpen] = useState<any | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templateId, setTemplateId] = useState("");


  const { data, isLoading } = useQuery({
    queryKey: ["emails"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("*, application:applications(id, stage, match_score, job:jobs(id,title,department,location), candidate:candidates(full_name,email))")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const { data: templates } = useQuery({
    queryKey: ["email_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_templates").select("*").order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const openDraft = (e: any) => {
    setOpen(e);
    setSubject(e.subject ?? "");
    setBody(e.body ?? "");
    setTemplateId(e.template_id ?? "");
  };

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = (templates ?? []).find((t: any) => t.id === id);
    if (!tpl || !open) return;
    const vars = {
      ...varsForApplication(open.application),
      ...(open.variables && typeof open.variables === "object" ? (open.variables as Record<string, string>) : {}),
      recruiter_name: "The HireFlow Talent Team",
    };
    setSubject(renderTemplate(tpl.subject, vars));
    setBody(renderTemplate(tpl.body, vars));
    const missing = unresolvedVariables(vars, tpl.subject, tpl.body);
    if (missing.length) toast.warning(`Fill in manually: ${missing.join(", ")}`);
  };

  const save = useMutation({
    mutationFn: async ({ status }: { status: "draft" | "sent" }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const tpl = (templates ?? []).find((t: any) => t.id === templateId);
      const { error } = await supabase
        .from("emails")
        .update({
          subject,
          body,
          status,
          template_id: templateId || null,
          template_name: tpl?.name ?? null,
          ...(status === "sent"
            ? {
                sent_at: new Date().toISOString(),
                approved_at: new Date().toISOString(),
                approved_by: userRes.user?.id ?? null,
                delivery_note: "Approved by a human reviewer in the HireFlow approval queue.",
              }
            : {}),
        })
        .eq("id", open.id);
      if (error) throw new Error(error.message);

      if (status === "sent") {
        const { error: apErr } = await supabase.from("approvals").insert({
          application_id: open.application?.id ?? null,
          entity_type: "email",
          entity_id: open.id,
          decision: "approved",
          decided_by: userRes.user?.id ?? null,
          previous_value: { subject: open.subject, body: open.body, status: open.status } as never,
          new_value: { subject, body, status: "sent", template: tpl?.name ?? null } as never,
          comment: `Approved sending the ${humanise(open.kind).toLowerCase()} message to ${open.application?.candidate?.full_name ?? "the candidate"}.`,
        });
        if (apErr) throw new Error(apErr.message);
      }

      await recordAudit({
        action: status === "sent" ? "email.approve_send" : "email.edit",
        entity_type: "email",
        entity_id: open.id,
        job_id: open.application?.job?.id ?? null,
        summary:
          status === "sent"
            ? `Human approved and sent the ${humanise(open.kind).toLowerCase()} email to ${open.application?.candidate?.full_name}${tpl ? ` using the “${tpl.name}” template` : ""}.`
            : `Edited the ${humanise(open.kind).toLowerCase()} draft for ${open.application?.candidate?.full_name}.`,
        details: { template: tpl?.name ?? null, subject },
      });
    },
    onSuccess: (_r, v) => {
      toast.success(v.status === "sent" ? "Email approved, sent and logged in the approval trail" : "Draft saved");
      setOpen(null);
      qc.invalidateQueries({ queryKey: ["emails"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });


  return (
    <>
      <PageHeader
        eyebrow="Communication"
        title="Candidate emails"
        description="The agent drafts; a human edits and approves. No message ever leaves this workspace without a recorded human decision."
      />

      {isLoading ? (
        <LoadingPanel rows={4} label="Loading drafts…" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<Mail className="size-6" />}
          title="No drafts yet"
          description="Draft an email from a candidate review panel or an approved offer, and it will appear here for approval."
        />
      ) : (
        <div className="panel overflow-hidden">
          <ul className="divide-y divide-border">
            {data?.map((e: any) => (
              <li key={e.id} className="flex flex-wrap items-center gap-4 px-5 py-4 hover:bg-surface-2/50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.subject || "(no subject)"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.application?.candidate?.full_name} · {e.to_email || "no address"} · {e.application?.job?.title}
                  </p>
                </div>
                <Pill tone="neutral">{humanise(e.kind)}</Pill>
                <Pill tone={e.status === "sent" ? "success" : e.status === "approved" ? "accent" : "warning"}>
                  {humanise(e.status)}
                </Pill>
                <button
                  onClick={() => openDraft(e)}
                  className="focus-ring rounded-lg bg-secondary px-3 py-2 text-xs font-medium hover:bg-surface-2"
                >
                  {e.status === "sent" ? "View" : "Review"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm">
          <div className="glass-panel rise-in w-full max-w-2xl rounded-2xl p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold">{humanise(open.kind)} email</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  To {open.application?.candidate?.full_name} · {open.to_email || "no address on file"}
                </p>
              </div>
              <button onClick={() => setOpen(null)} className="focus-ring rounded-md p-2" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>

            {canWrite && open.status !== "sent" ? (
              <>
                <label htmlFor="tpl" className="mb-1.5 mt-6 block text-xs font-medium text-muted-foreground">
                  Apply a reusable template
                </label>
                <select
                  id="tpl"
                  value={templateId}
                  onChange={(ev) => applyTemplate(ev.target.value)}
                  className="focus-ring w-full rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm outline-none"
                >
                  <option value="">No template — keep the current wording</option>
                  {(templates ?? []).map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({humanise(t.kind)})
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Placeholders are filled from this application. You can still edit everything before approving.
                </p>
              </>
            ) : open.template_name ? (
              <p className="mt-6 text-xs text-muted-foreground">Sent from the “{open.template_name}” template.</p>
            ) : null}

            <label htmlFor="subj" className="mb-1.5 mt-6 block text-xs font-medium text-muted-foreground">
              Subject
            </label>
            <input
              id="subj"
              value={subject}
              disabled={!canWrite || open.status === "sent"}
              onChange={(ev) => setSubject(ev.target.value)}
              className="focus-ring w-full rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm outline-none"
            />

            <label htmlFor="bd" className="mb-1.5 mt-4 block text-xs font-medium text-muted-foreground">
              Body
            </label>
            <textarea
              id="bd"
              rows={14}
              value={body}
              disabled={!canWrite || open.status === "sent"}
              onChange={(ev) => setBody(ev.target.value)}
              className="focus-ring w-full resize-y rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm leading-relaxed outline-none"
            />

            {canWrite && open.status !== "sent" ? (
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => save.mutate({ status: "draft" })}
                  disabled={save.isPending}
                  className="focus-ring rounded-xl border border-border px-4 py-2.5 text-sm disabled:opacity-60"
                >
                  Save draft
                </button>
                <button
                  onClick={() => save.mutate({ status: "sent" })}
                  disabled={save.isPending}
                  className="focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
                  style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
                >
                  <Send className="size-4" />
                  Approve & send
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
