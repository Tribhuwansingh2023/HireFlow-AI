/**
 * RecruitGPT streaming endpoint.
 * Runs the multi-agent loop and streams status, tool activity, cards and answer
 * tokens back to the browser as SSE. Auth is the caller's own Supabase session,
 * so every database read/write inside the agent respects RLS.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { runCopilot } from "@/lib/recruitgpt.server";

export const Route = createFileRoute("/api/copilot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.toLowerCase().startsWith("bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }

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

        let body: { threadId?: string; question?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const question = (body.question ?? "").trim();
        if (!question) return new Response("Question required", { status: 400 });

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (event: unknown) => {
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
              } catch {
                /* client disconnected */
              }
            };

            try {
              /* -- thread -- */
              let threadId = body.threadId ?? "";
              const title = question.slice(0, 70);
              if (threadId) {
                const { data: t } = await db.from("copilot_threads").select("id, title").eq("id", threadId).maybeSingle();
                if (!t) threadId = "";
                else if (t.title === "New conversation") {
                  await db.from("copilot_threads").update({ title, last_message_at: new Date().toISOString() }).eq("id", threadId);
                } else {
                  await db.from("copilot_threads").update({ last_message_at: new Date().toISOString() }).eq("id", threadId);
                }
              }
              if (!threadId) {
                const { data: created, error } = await db
                  .from("copilot_threads")
                  .insert({ user_id: userId, title })
                  .select("id")
                  .single();
                if (error) throw new Error(error.message);
                threadId = created.id;
              }
              send({ type: "thread", threadId, title });

              /* -- history + memory -- */
              const [{ data: history }, { data: memory }] = await Promise.all([
                db
                  .from("copilot_turns")
                  .select("role, content")
                  .eq("thread_id", threadId)
                  .order("created_at", { ascending: true })
                  .limit(20),
                db.from("copilot_memory").select("key, value").eq("user_id", userId).limit(10),
              ]);

              await db.from("copilot_turns").insert({ thread_id: threadId, user_id: userId, role: "user", content: question });
              await db.from("copilot_saved_queries").insert({ user_id: userId, label: title, query: question, kind: "recent" });

              const answer = await runCopilot({
                db: db as never,
                userId,
                threadId,
                question,
                history: (history ?? []) as Array<{ role: string; content: string }>,
                memory: (memory ?? []) as Array<{ key: string; value: unknown }>,
                emit: send,
              });

              const { data: turn } = await db
                .from("copilot_turns")
                .insert({
                  thread_id: threadId,
                  user_id: userId,
                  role: "assistant",
                  content: answer.content,
                  reasoning: answer.reasoning,
                  evidence: answer.evidence,
                  decision_path: answer.decisionPath,
                  supporting_data: { ...answer.supportingData, cards: answer.cards },
                  actions: answer.traces.filter((t) => /schedule|draft_email|decision|create_job|report/.test(t.tool)),
                  agents: answer.traces,
                  follow_ups: answer.followUps,
                  confidence: answer.confidence,
                  model: answer.model,
                  model_version: answer.modelVersion,
                  latency_ms: answer.latencyMs,
                })
                .select("id")
                .single();

              await db.from("audit_events").insert({
                actor_id: userId,
                actor_type: "agent",
                action: "copilot.answered",
                entity_type: "copilot_turn",
                entity_id: turn?.id ?? null,
                summary: `RecruitGPT answered: ${title}`,
                details: {
                  question,
                  confidence: answer.confidence,
                  tools: answer.traces.map((t) => t.tool),
                  evidence: answer.evidence,
                },
                model: answer.model,
              });

              send({ type: "final", answer, turnId: turn?.id ?? "" });
            } catch (e) {
              const message = e instanceof Error ? e.message : "The copilot failed.";
              console.error("[api/copilot]", message);
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
