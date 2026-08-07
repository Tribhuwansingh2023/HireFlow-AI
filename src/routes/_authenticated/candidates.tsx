import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Search, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { EmptyState, LoadingPanel, PageHeader, Pill } from "@/components/ui-kit";
import { semanticSearch } from "@/lib/agents.functions";
import { errorMessage } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/candidates")({
  head: () => ({
    meta: [
      { title: "Talent pool — HireFlow AI" },
      { name: "description", content: "Search your entire talent pool by meaning, not keywords." },
      { property: "og:title", content: "Talent pool — HireFlow AI" },
      { property: "og:description", content: "Semantic search across every parsed resume in your workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CandidatesPage,
});

function CandidatesPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);

  const { data: candidates, isLoading } = useQuery({
    queryKey: ["candidates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("*, applications(id, stage, match_score, job:jobs(title))")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await semanticSearch({ data: { query: query.trim() } });
      setResults(res.results);
      if (!res.results.length) toast.info("No semantic matches above the relevance threshold.");
    } catch (error) {
      toast.error(errorMessage(error, "Search failed"));
    } finally {
      setSearching(false);
    }
  };

  const list = candidates ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Talent"
        title="Candidate pool"
        description="Every parsed resume becomes a reusable profile with an embedding, so you can search by intent — “fintech backend engineer who has scaled Postgres” — across all roles."
      />

      <form onSubmit={runSearch} className="panel mb-6 flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Describe the person you need…"
            aria-label="Semantic candidate search"
            className="focus-ring w-full rounded-xl border border-input bg-background/60 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary/50"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
          style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
        >
          {searching ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Semantic search
        </button>
        {results ? (
          <button
            type="button"
            onClick={() => {
              setResults(null);
              setQuery("");
            }}
            className="focus-ring rounded-xl border border-border px-4 py-2.5 text-sm"
          >
            Clear
          </button>
        ) : null}
      </form>

      {results ? (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-sm font-semibold">
            {results.length} semantic matches for “{query}”
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {results.map((r) => (
              <article key={r.id} className="panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-base font-semibold">{r.full_name}</h3>
                    <p className="truncate text-xs text-muted-foreground">{r.headline || "—"}</p>
                  </div>
                  <Pill tone="accent">{Math.round(r.similarity * 100)}% match</Pill>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  vector {Math.round(r.vector_score * 100)}% · keyword {Math.round(r.keyword_score * 100)}% ·{" "}
                  {r.years_experience}y · {r.location || "location unknown"}
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {(r.skills ?? []).slice(0, 8).map((s: string) => (
                    <span key={s} className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">
                      {s}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {isLoading ? (
        <LoadingPanel rows={5} label="Loading candidates…" />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Users className="size-6" />}
          title="No candidates yet"
          description="Upload resumes from a job pipeline — parsed profiles land here automatically and stay searchable forever."
        />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="hairline text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Candidate</th>
                <th className="px-5 py-3 font-medium">Experience</th>
                <th className="px-5 py-3 font-medium">Top skills</th>
                <th className="px-5 py-3 font-medium">Applications</th>
                <th className="px-5 py-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((c: any) => (
                <tr key={c.id} className="transition-colors hover:bg-surface-2/50">
                  <td className="px-5 py-3">
                    <Link
                      to="/candidates/$candidateId"
                      params={{ candidateId: c.id }}
                      className="focus-ring font-medium hover:text-primary"
                    >
                      {c.full_name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{c.email || "no email"}</p>
                  </td>

                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {c.years_experience}y · {c.location || "—"}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(c.skills ?? []).slice(0, 5).map((s: string) => (
                        <span key={s} className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {(c.applications ?? []).length
                      ? (c.applications ?? [])
                          .map((a: any) => `${a.job?.title ?? "role"} (${a.match_score ?? "–"})`)
                          .join(", ")
                      : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <Pill tone={c.ocr_used ? "warning" : "neutral"}>{c.ocr_used ? "OCR" : "text layer"}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
