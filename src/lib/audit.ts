import { supabase } from "@/integrations/supabase/client";

export type AuditInput = {
  action: string;
  entity_type: string;
  entity_id?: string | null;
  job_id?: string | null;
  summary: string;
  details?: Record<string, unknown>;
  actor_type?: "human" | "agent" | "system";
};

/** Records a human action in the immutable audit trail. Never throws into the UI. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("audit_events").insert({
      actor_id: data.user?.id ?? null,
      actor_type: input.actor_type ?? "human",
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id ?? null,
      job_id: input.job_id ?? null,
      summary: input.summary,
      details: (input.details ?? {}) as never,
    });
  } catch (error) {
    console.error("[audit] failed to record event", error);
  }
}

export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}
