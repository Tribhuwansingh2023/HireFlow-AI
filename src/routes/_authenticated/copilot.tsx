import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  Bookmark,
  ChevronDown,
  Command as CommandIcon,
  FileText,
  History,
  Loader2,
  Mic,
  MicOff,
  Pin,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  Trash2,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { CopilotCardView } from "@/components/recruitgpt-cards";
import {
  AGENTS,
  EXAMPLE_PROMPTS,
  FOLLOW_UP_DEFAULTS,
  QUICK_ACTIONS,
  RECRUITGPT_VERSION,
  type AgentKey,
  type CopilotAnswer,
  type CopilotCard,
  type ToolTrace,
} from "@/lib/recruitgpt";
import { errorMessage } from "@/lib/audit";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export const Route = createFileRoute("/_authenticated/copilot")({
  head: () => ({
    meta: [
      { title: "RecruitGPT — AI Hiring Copilot | HireFlow AI" },
      {
        name: "description",
        content:
          "Ask in plain English and RecruitGPT searches resumes, ranks candidates, explains decisions, schedules interviews and drafts emails from your live hiring data.",
      },
      { property: "og:title", content: "RecruitGPT — AI Hiring Copilot" },
      {
        property: "og:description",
        content: "One conversational surface for search, ranking, explainability and recruitment automation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecruitGptPage,
});

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: { summary?: string; steps?: string[] };
  evidence?: string[];
  decisionPath?: string[];
  cards?: CopilotCard[];
  followUps?: string[];
  traces?: ToolTrace[];
  confidence?: number;
  model?: string;
  modelVersion?: string;
  latencyMs?: number;
  createdAt?: string;
  streaming?: boolean;
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function RecruitGptPage() {
  const qc = useQueryClient();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [activeTools, setActiveTools] = useState<ToolTrace[]>([]);
  const [running, setRunning] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  /* ---------------- side panel data ---------------- */
  const threads = useQuery({
    queryKey: ["copilot-threads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("copilot_threads")
        .select("id, title, pinned, last_message_at")
        .order("pinned", { ascending: false })
        .order("last_message_at", { ascending: false })
        .limit(60);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const saved = useQuery({
    queryKey: ["copilot-saved"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("copilot_saved_queries")
        .select("id, label, query, kind, created_at")
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const favorites = useQuery({
    queryKey: ["copilot-favorites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("copilot_favorites")
        .select("id, note, candidates(id, full_name, headline)")
        .limit(20);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const reports = useQuery({
    queryKey: ["copilot-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("copilot_reports")
        .select("id, title, created_at, status")
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  /* ---------------- load a thread ---------------- */
  const openThread = useCallback(async (id: string) => {
    setThreadId(id);
    const { data, error } = await supabase
      .from("copilot_turns")
      .select("*")
      .eq("thread_id", id)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(error.message);
      return;
    }
    setTurns(
      (data ?? []).map((t: any) => ({
        id: t.id,
        role: t.role,
        content: t.content,
        reasoning: t.reasoning ?? {},
        evidence: t.evidence ?? [],
        decisionPath: t.decision_path ?? [],
        cards: (t.supporting_data?.cards ?? []) as CopilotCard[],
        followUps: t.follow_ups ?? [],
        traces: (t.agents ?? []) as ToolTrace[],
        confidence: t.confidence ?? undefined,
        model: t.model ?? undefined,
        modelVersion: t.model_version,
        latencyMs: t.latency_ms ?? undefined,
        createdAt: t.created_at,
      })),
    );
  }, []);

  const newThread = useCallback(() => {
    setThreadId(null);
    setTurns([]);
    setActiveTools([]);
    setStatus(null);
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, activeTools, status]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId, running]);

  /* ---------------- command palette ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        newThread();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newThread]);

  /* ---------------- voice ---------------- */
  const toggleMic = () => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice input is not supported in this browser.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      const text = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join(" ");
      setInput(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  const speakAnswer = useCallback(
    (text: string) => {
      if (!speak || typeof window === "undefined" || !window.speechSynthesis) return;
      const clean = text.replace(/[#*`>_-]/g, " ").slice(0, 900);
      const utter = new SpeechSynthesisUtterance(clean);
      utter.rate = 1.03;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    },
    [speak],
  );

  /* ---------------- ask ---------------- */
  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || running) return;
      setInput("");
      setRunning(true);
      setStatus("Connecting");
      setActiveTools([]);
      const localId = `local-${Date.now()}`;
      setTurns((t) => [
        ...t,
        { id: `${localId}-u`, role: "user", content: q },
        { id: localId, role: "assistant", content: "", cards: [], streaming: true },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("Your session expired. Please sign in again.");

        const res = await fetch("/api/copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ threadId, question: q }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(await res.text().catch(() => "The copilot is unavailable."));

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finished = false;

        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.trim();
            if (!line.startsWith("data:")) continue;
            let event: any;
            try {
              event = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            if (event.type === "thread") {
              setThreadId(event.threadId);
            } else if (event.type === "status") {
              setStatus(event.label);
            } else if (event.type === "tool") {
              if (event.phase === "start") {
                setStatus(event.trace.label);
                setActiveTools((t) => [...t, { ...event.trace, ok: true, ms: 0, input: {}, summary: "" }]);
              } else {
                setActiveTools((t) => t.map((x) => (x.tool === event.trace.tool && !x.summary ? event.trace : x)));
              }
            } else if (event.type === "card") {
              setTurns((t) =>
                t.map((x) => (x.id === localId ? { ...x, cards: [...(x.cards ?? []), event.card] } : x)),
              );
            } else if (event.type === "delta") {
              setStatus(null);
              setTurns((t) => t.map((x) => (x.id === localId ? { ...x, content: x.content + event.text } : x)));
            } else if (event.type === "final") {
              const a = event.answer as CopilotAnswer;
              finished = true;
              setTurns((t) =>
                t.map((x) =>
                  x.id === localId
                    ? {
                        ...x,
                        id: event.turnId || localId,
                        content: a.content,
                        reasoning: a.reasoning,
                        evidence: a.evidence,
                        decisionPath: a.decisionPath,
                        cards: a.cards,
                        followUps: a.followUps,
                        traces: a.traces,
                        confidence: a.confidence,
                        model: a.model,
                        modelVersion: a.modelVersion,
                        latencyMs: a.latencyMs,
                        streaming: false,
                      }
                    : x,
                ),
              );
              speakAnswer(a.content);
            } else if (event.type === "error") {
              throw new Error(event.message);
            }
          }
        }
      } catch (e: any) {
        if (e?.name === "AbortError") {
          setTurns((t) => t.map((x) => (x.streaming ? { ...x, streaming: false, content: x.content || "_Stopped._" } : x)));
        } else {
          const msg = errorMessage(e, "The copilot could not answer that");
          toast.error(msg);
          setTurns((t) =>
            t.map((x) => (x.streaming ? { ...x, streaming: false, content: x.content || `⚠️ ${msg}` } : x)),
          );
        }
      } finally {
        setRunning(false);
        setStatus(null);
        setActiveTools([]);
        abortRef.current = null;
        void qc.invalidateQueries({ queryKey: ["copilot-threads"] });
        void qc.invalidateQueries({ queryKey: ["copilot-saved"] });
        void qc.invalidateQueries({ queryKey: ["copilot-reports"] });
      }
    },
    [qc, running, speakAnswer, threadId],
  );

  const pinThread = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase.from("copilot_threads").update({ pinned }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["copilot-threads"] }),
  });

  const deleteThread = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("copilot_threads").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, id) => {
      if (id === threadId) newThread();
      void qc.invalidateQueries({ queryKey: ["copilot-threads"] });
    },
  });

  const saveQuery = async () => {
    const last = [...turns].reverse().find((t) => t.role === "user");
    if (!last) return;
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) return;
    const { error } = await supabase
      .from("copilot_saved_queries")
      .insert({ user_id: userId, label: last.content.slice(0, 60), query: last.content, kind: "saved" });
    if (error) toast.error(error.message);
    else {
      toast.success("Query saved");
      void qc.invalidateQueries({ queryKey: ["copilot-saved"] });
    }
  };

  const pinned = (threads.data ?? []).filter((t: any) => t.pinned);
  const recentThreads = (threads.data ?? []).filter((t: any) => !t.pinned);
  const recentSearches = (saved.data ?? []).filter((s: any) => s.kind === "recent").slice(0, 8);
  const savedQueries = (saved.data ?? []).filter((s: any) => s.kind === "saved").slice(0, 8);

  const hasConversation = turns.length > 0;

  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] gap-0 sm:-m-6 lg:-m-8">
      {/* ------------- side panel ------------- */}
      <aside className="hidden w-[260px] shrink-0 flex-col border-r border-border/60 bg-card/40 backdrop-blur-xl lg:flex">
        <div className="p-3">
          <button
            type="button"
            onClick={newThread}
            className="flex w-full items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-twin-violet px-3 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-110"
          >
            <Plus className="size-4" /> New conversation
          </button>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="mt-2 flex w-full items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
          >
            <span className="flex items-center gap-2">
              <Search className="size-3.5" /> Quick actions
            </span>
            <kbd className="rounded border border-border/60 px-1 py-0.5 text-[10px]">⌘K</kbd>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          <PanelGroup title="Pinned" icon={<Pin className="size-3" />} count={pinned.length}>
            {pinned.map((t: any) => (
              <ThreadRow
                key={t.id}
                thread={t}
                active={t.id === threadId}
                onOpen={() => openThread(t.id)}
                onPin={() => pinThread.mutate({ id: t.id, pinned: !t.pinned })}
                onDelete={() => deleteThread.mutate(t.id)}
              />
            ))}
          </PanelGroup>

          <PanelGroup title="Conversations" icon={<History className="size-3" />} count={recentThreads.length}>
            {recentThreads.slice(0, 20).map((t: any) => (
              <ThreadRow
                key={t.id}
                thread={t}
                active={t.id === threadId}
                onOpen={() => openThread(t.id)}
                onPin={() => pinThread.mutate({ id: t.id, pinned: !t.pinned })}
                onDelete={() => deleteThread.mutate(t.id)}
              />
            ))}
          </PanelGroup>

          <PanelGroup title="Saved queries" icon={<Bookmark className="size-3" />} count={savedQueries.length}>
            {savedQueries.map((s: any) => (
              <button
                key={s.id}
                type="button"
                onClick={() => ask(s.query)}
                className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
              >
                {s.label}
              </button>
            ))}
          </PanelGroup>

          <PanelGroup title="Recent searches" icon={<Search className="size-3" />} count={recentSearches.length}>
            {recentSearches.map((s: any) => (
              <button
                key={s.id}
                type="button"
                onClick={() => ask(s.query)}
                className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
              >
                {s.label}
              </button>
            ))}
          </PanelGroup>

          <PanelGroup title="Favourite candidates" icon={<Star className="size-3" />} count={(favorites.data ?? []).length}>
            {(favorites.data ?? []).map((f: any) => (
              <Link
                key={f.id}
                to="/candidates/$candidateId"
                params={{ candidateId: f.candidates?.id }}
                className="block truncate rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
              >
                {f.candidates?.full_name}
              </Link>
            ))}
          </PanelGroup>

          <PanelGroup title="Draft reports" icon={<FileText className="size-3" />} count={(reports.data ?? []).length}>
            {(reports.data ?? []).map((r: any) => (
              <button
                key={r.id}
                type="button"
                onClick={() => ask(`Summarise the report “${r.title}” and its final recommendation.`)}
                className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
              >
                {r.title}
              </button>
            ))}
          </PanelGroup>
        </div>
      </aside>

      {/* ------------- conversation ------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary via-twin-violet to-twin-cyan text-primary-foreground shadow-lg shadow-primary/25">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-display text-base font-semibold text-foreground">RecruitGPT</h1>
              <p className="truncate text-[11px] text-muted-foreground">
                AI Hiring Copilot · 8 specialist agents · {RECRUITGPT_VERSION}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSpeak((s) => !s)}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
                speak ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
              title="Speak answers aloud"
            >
              <Volume2 className="size-3.5" />
            </button>
            {hasConversation ? (
              <button
                type="button"
                onClick={saveQuery}
                className="rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
              >
                <Bookmark className="size-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground transition hover:text-foreground sm:flex"
            >
              <CommandIcon className="size-3.5" /> K
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto w-full max-w-3xl">
            {!hasConversation ? <Hero onPick={ask} /> : null}

            <div className="space-y-6">
              {turns.map((turn) =>
                turn.role === "user" ? (
                  <div key={turn.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-lg shadow-primary/20">
                      {turn.content}
                    </div>
                  </div>
                ) : (
                  <AssistantTurn key={turn.id} turn={turn} onFollowUp={ask} />
                ),
              )}
            </div>

            {running ? <AgentActivity status={status} tools={activeTools} /> : null}
            <div ref={endRef} />
          </div>
        </div>

        {/* ------------- composer ------------- */}
        <div className="border-t border-border/60 bg-background/80 px-4 py-4 backdrop-blur-xl sm:px-6">
          <div className="mx-auto w-full max-w-3xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask(input);
              }}
              className="relative rounded-2xl border border-border/70 bg-card/70 p-2 shadow-[0_20px_60px_-40px_rgba(0,0,0,1)] transition focus-within:border-primary/50"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(input);
                  }
                }}
                rows={1}
                placeholder="What would you like to do today?"
                className="max-h-40 min-h-[44px] w-full resize-none bg-transparent px-3 py-2.5 pr-24 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleMic}
                  className={cn(
                    "grid size-9 place-items-center rounded-xl border transition",
                    listening
                      ? "border-destructive/50 bg-destructive/15 text-destructive"
                      : "border-border/60 text-muted-foreground hover:text-foreground",
                  )}
                  title="Voice input"
                >
                  {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                </button>
                {running ? (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    className="grid size-9 place-items-center rounded-xl bg-muted text-foreground transition hover:bg-muted/70"
                    title="Stop"
                  >
                    <Square className="size-3.5" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-twin-violet text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 disabled:opacity-40"
                    title="Send"
                  >
                    <ArrowUp className="size-4" />
                  </button>
                )}
              </div>
            </form>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              RecruitGPT queries your live workspace. Emails and hiring decisions always require human approval · every
              answer is written to the audit trail.
            </p>
          </div>
        </div>
      </div>

      {/* ------------- command palette ------------- */}
      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <Command>
          <CommandInput placeholder="Run a command or ask RecruitGPT…" />
          <CommandList>
            <CommandEmpty>No matching command.</CommandEmpty>
            <CommandGroup heading="Quick actions">
              {QUICK_ACTIONS.map((a) => (
                <CommandItem
                  key={a.label}
                  onSelect={() => {
                    setPaletteOpen(false);
                    setInput(a.prompt);
                    inputRef.current?.focus();
                  }}
                >
                  <Sparkles className="mr-2 size-3.5" /> {a.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Prompts">
              {EXAMPLE_PROMPTS.map((p) => (
                <CommandItem
                  key={p.text}
                  onSelect={() => {
                    setPaletteOpen(false);
                    void ask(p.text);
                  }}
                >
                  <Search className="mr-2 size-3.5" /> {p.text}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Navigate">
              <CommandItem onSelect={() => { setPaletteOpen(false); newThread(); }}>
                <Plus className="mr-2 size-3.5" /> New conversation
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function PanelGroup({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
}) {
  if (!count) return null;
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {icon} {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ThreadRow({
  thread,
  active,
  onOpen,
  onPin,
  onDelete,
}: {
  thread: any;
  active: boolean;
  onOpen: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-lg px-2 py-1.5 transition",
        active ? "bg-primary/12 text-foreground" : "hover:bg-muted/50",
      )}
    >
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground group-hover:text-foreground">
        {thread.title}
      </button>
      <button type="button" onClick={onPin} className="opacity-0 transition group-hover:opacity-100" title="Pin">
        <Pin className={cn("size-3", thread.pinned ? "text-primary" : "text-muted-foreground")} />
      </button>
      <button type="button" onClick={onDelete} className="opacity-0 transition group-hover:opacity-100" title="Delete">
        <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
      </button>
    </div>
  );
}

function Hero({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="mb-8 text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        <ShieldCheck className="size-3 text-success" /> Grounded in your live workspace
      </span>
      <h2 className="mt-4 bg-gradient-to-r from-foreground via-primary to-twin-cyan bg-clip-text font-display text-3xl font-semibold text-transparent sm:text-4xl">
        What would you like to do today?
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Search resumes, rank a pipeline, explain a decision, compare candidates, run the hiring debate, schedule
        interviews or generate a leadership report — all from one conversation.
      </p>
      <div className="mt-6 grid gap-2 text-left sm:grid-cols-2">
        {EXAMPLE_PROMPTS.slice(0, 8).map((p) => (
          <button
            key={p.text}
            type="button"
            onClick={() => onPick(p.text)}
            className="group rounded-xl border border-border/60 bg-card/50 p-3 text-left transition hover:border-primary/50 hover:bg-card"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">{p.group}</p>
            <p className="mt-1 text-sm text-foreground/90 group-hover:text-foreground">{p.text}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function AgentActivity({ status, tools }: { status: string | null; tools: ToolTrace[] }) {
  return (
    <div className="mt-6 rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin text-primary" />
        <p className="text-sm font-medium text-foreground">{status ?? "Thinking"}</p>
      </div>
      {tools.length ? (
        <ul className="mt-3 space-y-1.5">
          {tools.map((t, i) => (
            <li key={`${t.tool}-${i}`} className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  t.summary ? "bg-success" : "animate-pulse bg-primary",
                )}
              />
              <span className={cn("font-medium", AGENTS[t.agent as AgentKey]?.color ?? "text-primary")}>
                {AGENTS[t.agent as AgentKey]?.label ?? "Agent"}
              </span>
              <span className="text-muted-foreground">{t.summary || `${t.label}…`}</span>
              {t.ms ? <span className="ml-auto tabular-nums text-muted-foreground/70">{t.ms}ms</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AssistantTurn({ turn, onFollowUp }: { turn: Turn; onFollowUp: (q: string) => void }) {
  const [openReasoning, setOpenReasoning] = useState(false);
  const followUps = useMemo(
    () => (turn.followUps?.length ? turn.followUps : turn.streaming ? [] : FOLLOW_UP_DEFAULTS.slice(0, 4)),
    [turn.followUps, turn.streaming],
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary via-twin-violet to-twin-cyan text-primary-foreground">
          <Sparkles className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed text-foreground/90 prose-headings:font-display prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.content || "…"}</ReactMarkdown>
          </div>
          {turn.streaming ? <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-middle" /> : null}
        </div>
      </div>

      {turn.cards?.length ? (
        <div className="ml-10 space-y-3">
          {turn.cards.map((card, i) => (
            <CopilotCardView key={i} card={card} />
          ))}
        </div>
      ) : null}

      {!turn.streaming && (turn.evidence?.length || turn.reasoning?.summary) ? (
        <div className="ml-10 rounded-2xl border border-border/60 bg-card/50 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setOpenReasoning((o) => !o)}
            className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
          >
            <span className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold uppercase tracking-[0.16em] text-primary">AI reasoning</span>
              {turn.confidence != null ? (
                <span className="rounded-md bg-success/12 px-1.5 py-0.5 font-medium text-success">
                  {Math.round(turn.confidence * 100)}% confidence
                </span>
              ) : null}
              {(turn.evidence ?? []).slice(0, 4).map((e) => (
                <span key={e} className="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">
                  {e}
                </span>
              ))}
            </span>
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition", openReasoning && "rotate-180")} />
          </button>
          {openReasoning ? (
            <div className="space-y-3 border-t border-border/50 px-4 py-3 text-xs">
              {turn.reasoning?.summary ? (
                <p className="leading-relaxed text-foreground/85">{turn.reasoning.summary}</p>
              ) : null}
              {turn.reasoning?.steps?.length ? (
                <div>
                  <p className="mb-1 font-semibold uppercase tracking-wider text-muted-foreground">Reasoning</p>
                  <ol className="list-decimal space-y-0.5 pl-4 text-muted-foreground">
                    {turn.reasoning.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {turn.decisionPath?.length ? (
                <div>
                  <p className="mb-1 font-semibold uppercase tracking-wider text-muted-foreground">Decision path</p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {turn.decisionPath.map((s, i) => (
                      <li key={i}>→ {s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {turn.traces?.length ? (
                <div>
                  <p className="mb-1 font-semibold uppercase tracking-wider text-muted-foreground">Agents used</p>
                  <ul className="space-y-0.5">
                    {turn.traces.map((t, i) => (
                      <li key={i} className="flex gap-2">
                        <span className={cn("font-medium", AGENTS[t.agent as AgentKey]?.color ?? "text-primary")}>
                          {AGENTS[t.agent as AgentKey]?.label ?? t.agent}
                        </span>
                        <span className="text-muted-foreground">{t.summary}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="text-[10px] text-muted-foreground/70">
                Model {turn.model ?? "—"} · {turn.modelVersion ?? RECRUITGPT_VERSION}
                {turn.latencyMs ? ` · ${(turn.latencyMs / 1000).toFixed(1)}s` : ""} ·{" "}
                {turn.createdAt ? new Date(turn.createdAt).toLocaleString() : new Date().toLocaleString()}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {!turn.streaming && followUps.length ? (
        <div className="ml-10 flex flex-wrap gap-2">
          {followUps.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFollowUp(f)}
              className="rounded-full border border-border/60 bg-card/50 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
            >
              {f}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
