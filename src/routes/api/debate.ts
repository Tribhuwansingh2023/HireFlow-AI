/**
 * AI Recruiter Debate — live streaming endpoint.
 *
 * Runs the council graph and streams every node transition, agent opinion,
 * cross-examination turn, conflict and the final decision as SSE, then
 * persists the complete run for replay and audit. Auth is the caller's own
 * session, so every read and write respects RLS.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { loadDebateEvidence } from "@/lib/debate-evidence.server";
import { buildReasoningGraph, runDebateGraph, COUNCIL_MODEL, COUNCIL_MODEL_VERSION } from "@/lib/debate.server";
import type { DebateScenario } from "@/lib/debate";

export const Route = createFileRoute("/api/debate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.toLowerCase().startsWith("bearer ")) return new Response("Unauthorized", { status: 401 });

        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
        if (!url || !key) return new Response("Backend not configured", { status: 500 });

        const db = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: auth } },
        });

        const { data: userData, error: userErr } = await db.auth.getUser(auth.slice(7));
        if (userErr || !userData?.user) return new Response("Unauthorized", { status: 401 });
        const userId = userData.user.id;

        let body: {
          candidateId?: string;
          jobId?: string | null;
          scenario?: DebateScenario;
          simulation?: boolean;
          parentDebateId?: string | null;
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const candidateId = (body.candidateId ?? "").trim();
        if (!candidateId) return new Response("candidateId required", { status: 400 });

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (event: unknown) => {
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
              } catch {
                /* client gone */
              }
            };

            const started = Date.now();
            try {
              const { candidate, evidence, jobId, jobVersion, applicationIds } = await loadDebateEvidence(
                db as never,
                candidateId,
                body.jobId ?? null,
              );
              send({ type: "ready", candidate, jobId, jobVersion });

              const state = await runDebateGraph({
                candidate,
                evidence,
                ...(body.scenario ? { scenario: body.scenario } : {}),
                emit: send,
              });

              const graph = buildReasoningGraph(state.opinions, state.conflicts, state.final);
              const latency = Date.now() - started;
              const title = `${candidate.name} · ${(evidence as any).job?.title ?? "General review"}${
                body.simulation ? " (what-if)" : ""
              }`;

              const { data: saved, error: saveErr } = await db
                .from("debates")
                .insert({
                  title,
                  job_id: jobId,
                  job_version: jobVersion,
                  candidate_ids: [candidateId],
                  application_ids: applicationIds,
                  mode: "single",
                  scenario: body.scenario ?? {},
                  status: "completed",
                  model: COUNCIL_MODEL,
                  model_version: COUNCIL_MODEL_VERSION,
                  candidates: [candidate],
                  evidence: {
                    job: (evidence as any).job
                      ? { id: (evidence as any).job.id, title: (evidence as any).job.title }
                      : null,
                    counts: {
                      applications: (evidence as any).applications?.length ?? 0,
                      interviews: (evidence as any).interviews?.length ?? 0,
                      sessions: (evidence as any).sessions?.length ?? 0,
                      twin: Boolean((evidence as any).twin),
                    },
                  },
                  opinions: state.opinions,
                  rounds: state.rounds,
                  votes: state.votes,
                  conflicts: state.conflicts,
                  graph,
                  timeline: state.timeline,
                  final: state.final ?? {},
                  consensus: state.consensus,
                  confidence: state.final?.confidence ?? 0,
                  recommendation: state.final?.recommendation ?? null,
                  is_simulation: Boolean(body.simulation),
                  parent_debate_id: body.parentDebateId ?? null,
                  latency_ms: latency,
                  created_by: userId,
                })
                .select("*")
                .single();
              if (saveErr) throw new Error(saveErr.message);

              await db.from("audit_events").insert({
                actor_id: userId,
                actor_type: "agent",
                action: body.simulation ? "debate.simulated" : "debate.completed",
                entity_type: "debate",
                entity_id: saved.id,
                job_id: jobId,
                summary: `AI hiring council ${body.simulation ? "simulated" : "recommended"} ${
                  state.final?.recommendation?.replace("_", " ") ?? "no decision"
                } for ${candidate.name}`,
                details: {
                  consensus: state.consensus,
                  confidence: state.final?.confidence ?? 0,
                  votes: state.votes.map((v) => ({ agent: v.agent, verdict: v.verdict, confidence: v.confidence })),
                  conflicts: state.conflicts.map((c) => c.topic),
                  scenario: body.scenario ?? {},
                  latency_ms: latency,
                },
                model: COUNCIL_MODEL,
              });

              send({ type: "saved", debate: saved, latency });
            } catch (e) {
              const message = e instanceof Error ? e.message : "The council failed to convene.";
              console.error("[api/debate]", message);
              send({ type: "error", message });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
