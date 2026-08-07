import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollText, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState, LoadingPanel, PageHeader, Pill, humanise } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Audit trail — HireFlow AI" },
      { name: "description", content: "Immutable log of every agent decision and human override in your hiring workflow." },
      { property: "og:title", content: "Audit trail — HireFlow AI" },
      { property: "og:description", content: "Every AI decision and human override, permanently recorded." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const [q, setQ] = useState("");
  const [actor, setActor] = useState<"all" | "agent" | "human">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const rows = (data ?? []).filter(
    (e) =>
      (actor === "all" || e.actor_type === actor) &&
      `${e.action} ${e.summary} ${e.entity_type}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Audit trail"
        description="Track A requires traceability. Every automated step and every human override writes an immutable event here, with the model used and the payload that justified it."
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter events…"
            aria-label="Filter audit events"
            className="focus-ring w-full rounded-xl border border-input bg-surface py-2.5 pl-10 pr-3 text-sm outline-none"
          />
        </div>
        <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
          {(["all", "agent", "human"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setActor(a)}
              className={`focus-ring rounded-lg px-3 py-1.5 text-xs capitalize transition-colors ${
                actor === a ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingPanel rows={8} label="Loading audit events…" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<ScrollText className="size-6" />} title="No events match" description="Activity will appear here as you work." />
      ) : (
        <ol className="panel divide-y divide-border">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
              <Pill tone={e.actor_type === "agent" ? "accent" : "success"}>{e.actor_type}</Pill>
              <div className="min-w-0 flex-1">
                <p className="text-sm">{e.summary}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {e.action} · {humanise(e.entity_type)}
                  {e.model ? ` · ${e.model}` : ""}
                </p>
              </div>
              <time className="shrink-0 text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</time>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
