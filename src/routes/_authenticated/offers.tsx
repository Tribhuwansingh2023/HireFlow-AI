import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BadgeCheck, CircleSlash, Gavel, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState, LoadingPanel, PageHeader, Pill, humanise } from "@/components/ui-kit";
import { errorMessage, recordAudit } from "@/lib/audit";
import { useAuth } from "@/lib/use-auth";
import { draftEmail } from "@/lib/agents.functions";

export const Route = createFileRoute("/_authenticated/offers")({
  head: () => ({
    meta: [
      { title: "Offers — HireFlow AI" },
      { name: "description", content: "Multi-level offer approvals with a complete decision ledger." },
      { property: "og:title", content: "Offers — HireFlow AI" },
      { property: "og:description", content: "Route offers through multi-level human approval before anything is sent." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OffersPage,
});

const LEVELS = ["Hiring manager", "Department head", "Finance"];

function OffersPage() {
  const qc = useQueryClient();
  const { canWrite } = useAuth();
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["offers"],
    queryFn: async () => {
      const [offers, apps] = await Promise.all([
        supabase
          .from("offers")
          .select("*, approvals:offer_approvals(*), application:applications(id, stage, job:jobs(id,title), candidate:candidates(full_name,email))")
          .order("created_at", { ascending: false }),
        supabase
          .from("applications")
          .select("id, stage, job:jobs(id,title,salary_min,salary_max), candidate:candidates(full_name)")
          .in("stage", ["interviewing", "shortlisted", "offer"]),
      ]);
      if (offers.error) throw new Error(offers.error.message);
      if (apps.error) throw new Error(apps.error.message);
      return { offers: offers.data ?? [], apps: apps.data ?? [] };
    },
  });

  const decide = useMutation({
    mutationFn: async ({ offer, decision }: { offer: any; decision: "approved" | "rejected" }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const level = offer.current_level;
      const { error } = await supabase.from("offer_approvals").insert({
        offer_id: offer.id,
        level,
        level_name: LEVELS[level - 1] ?? `Level ${level}`,
        decision,
        decided_by: userRes.user?.id ?? null,
        decided_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);

      const isFinal = decision === "approved" && level >= offer.total_levels;
      const patch =
        decision === "rejected"
          ? { status: "rejected" }
          : isFinal
            ? { status: "approved" }
            : { current_level: level + 1 };
      const { error: upErr } = await supabase.from("offers").update(patch).eq("id", offer.id);
      if (upErr) throw new Error(upErr.message);

      if (isFinal) {
        await supabase.from("applications").update({ stage: "offer" }).eq("id", offer.application_id);
      }

      await recordAudit({
        action: `offer.${decision}`,
        entity_type: "offer",
        entity_id: offer.id,
        job_id: offer.application?.job?.id ?? null,
        summary: `${LEVELS[level - 1] ?? `Level ${level}`} ${decision} the offer for ${offer.application?.candidate?.full_name}${isFinal ? " — offer fully approved" : ""}.`,
        details: { level, decision },
      });
    },
    onSuccess: () => {
      toast.success("Approval recorded");
      qc.invalidateQueries({ queryKey: ["offers"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const sendDraft = useMutation({
    mutationFn: async (offer: any) => draftEmail({ data: { applicationId: offer.application_id, kind: "offer" } }),
    onSuccess: () => toast.success("Offer email drafted — review it under Emails"),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader
        eyebrow="Closing"
        title="Offer approvals"
        description="Offers move through three human approval levels. Nothing reaches a candidate until every level has signed off, and each signature is stored permanently."
        actions={
          canWrite ? (
            <button
              onClick={() => setCreating(true)}
              disabled={!(data?.apps ?? []).length}
              className="focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
            >
              <Plus className="size-4" />
              New offer
            </button>
          ) : null
        }
      />

      {isLoading ? (
        <LoadingPanel rows={4} label="Loading offers…" />
      ) : (data?.offers ?? []).length === 0 ? (
        <EmptyState
          icon={<Gavel className="size-6" />}
          title="No offers yet"
          description="Once a candidate clears their interview loop, raise an offer here to start the multi-level approval chain."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data?.offers.map((offer: any) => (
            <article key={offer.id} className="panel p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-display text-base font-semibold">
                    {offer.application?.candidate?.full_name}
                  </h2>
                  <p className="truncate text-xs text-muted-foreground">{offer.application?.job?.title}</p>
                </div>
                <Pill tone={offer.status === "approved" ? "success" : offer.status === "rejected" ? "danger" : "warning"}>
                  {humanise(offer.status)}
                </Pill>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Compensation</dt>
                  <dd className="mt-0.5 font-mono">
                    {offer.salary ? `${offer.currency} ${Number(offer.salary).toLocaleString()}` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Start date</dt>
                  <dd className="mt-0.5 font-mono">{offer.start_date ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Equity</dt>
                  <dd className="mt-0.5 font-mono">{offer.equity || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Approval level</dt>
                  <dd className="mt-0.5 font-mono">
                    {Math.min(offer.current_level, offer.total_levels)} / {offer.total_levels}
                  </dd>
                </div>
              </dl>

              <ol className="mt-4 space-y-2">
                {LEVELS.slice(0, offer.total_levels).map((name, i) => {
                  const record = (offer.approvals ?? []).find((a: any) => a.level === i + 1);
                  const active = offer.status === "pending" && offer.current_level === i + 1;
                  return (
                    <li
                      key={name}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-xs ${
                        active ? "border-primary/40 bg-primary/8" : "border-border bg-surface-2/40"
                      }`}
                    >
                      <span className="font-mono text-muted-foreground">{i + 1}</span>
                      <span className="flex-1">{name}</span>
                      {record ? (
                        <Pill tone={record.decision === "approved" ? "success" : "danger"}>{record.decision}</Pill>
                      ) : active ? (
                        <Pill tone="warning">awaiting you</Pill>
                      ) : (
                        <span className="text-muted-foreground">pending</span>
                      )}
                    </li>
                  );
                })}
              </ol>

              {canWrite && offer.status === "pending" ? (
                <div className="mt-4 flex gap-2 border-t border-border pt-4">
                  <button
                    onClick={() => decide.mutate({ offer, decision: "approved" })}
                    disabled={decide.isPending}
                    className="focus-ring inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-success/15 px-3 py-2.5 text-xs font-semibold text-success hover:bg-success/25 disabled:opacity-60"
                  >
                    <BadgeCheck className="size-4" />
                    Approve level {offer.current_level}
                  </button>
                  <button
                    onClick={() => decide.mutate({ offer, decision: "rejected" })}
                    disabled={decide.isPending}
                    className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-destructive/12 px-3 py-2.5 text-xs font-semibold text-destructive hover:bg-destructive/20 disabled:opacity-60"
                  >
                    <CircleSlash className="size-4" />
                    Reject
                  </button>
                </div>
              ) : null}

              {canWrite && offer.status === "approved" ? (
                <button
                  onClick={() => sendDraft.mutate(offer)}
                  disabled={sendDraft.isPending}
                  className="focus-ring mt-4 w-full rounded-xl border border-border px-3 py-2.5 text-xs font-medium hover:border-primary/40 disabled:opacity-60"
                >
                  Draft the offer email
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {creating ? (
        <CreateOffer
          apps={data?.apps ?? []}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ["offers"] });
          }}
        />
      ) : null}
    </>
  );
}

function CreateOffer({ apps, onClose, onDone }: { apps: any[]; onClose: () => void; onDone: () => void }) {
  const [applicationId, setApplicationId] = useState(apps[0]?.id ?? "");
  const [salary, setSalary] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [startDate, setStartDate] = useState("");
  const [equity, setEquity] = useState("");
  const [notes, setNotes] = useState("");

  const app = apps.find((a) => a.id === applicationId);

  const save = useMutation({
    mutationFn: async () => {
      if (!applicationId) throw new Error("Pick a candidate.");
      const { data: userRes } = await supabase.auth.getUser();
      const { data: offer, error } = await supabase
        .from("offers")
        .insert({
          application_id: applicationId,
          salary: salary ? Number(salary) : null,
          currency,
          start_date: startDate || null,
          equity: equity.trim() || null,
          notes: notes.trim() || null,
          total_levels: LEVELS.length,
          created_by: userRes.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await recordAudit({
        action: "offer.create",
        entity_type: "offer",
        entity_id: offer.id,
        job_id: app?.job?.id ?? null,
        summary: `Raised an offer for ${app?.candidate?.full_name} — ${LEVELS.length} approval levels required.`,
      });
    },
    onSuccess: () => {
      toast.success("Offer raised — approval chain started");
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm">
      <div className="glass-panel rise-in w-full max-w-lg rounded-2xl p-6">
        <div className="flex items-start justify-between">
          <h2 className="font-display text-lg font-semibold">Raise an offer</h2>
          <button onClick={onClose} className="focus-ring rounded-md p-2" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="offer-cand" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Candidate
            </label>
            <select
              id="offer-cand"
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
              className="focus-ring w-full rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm outline-none"
            >
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.candidate?.full_name} — {a.job?.title}
                </option>
              ))}
            </select>
            {app?.job?.salary_min ? (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Band for this role: {app.job.salary_min?.toLocaleString()} – {app.job.salary_max?.toLocaleString()}
              </p>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Base salary" type="number" value={salary} onChange={setSalary} />
            <Field label="Currency" value={currency} onChange={setCurrency} />
            <Field label="Start date" type="date" value={startDate} onChange={setStartDate} />
            <Field label="Equity" value={equity} onChange={setEquity} placeholder="0.15%" />
          </div>
          <div>
            <label htmlFor="offer-notes" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Notes for approvers
            </label>
            <textarea
              id="offer-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="focus-ring w-full resize-y rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm outline-none"
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
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Gavel className="size-4" />}
            Start approval chain
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
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
  const id = `offer-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
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
        className="focus-ring w-full rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/50"
      />
    </div>
  );
}
