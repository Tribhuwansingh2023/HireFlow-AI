/**
 * Thin server-only wrapper over the Lovable AI Gateway.
 * Used by every agent step (screening, question generation, drafting, copilot).
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export const DEFAULT_MODEL = "google/gemini-3.6-flash";
export const EMBEDDING_MODEL = "google/gemini-embedding-001";

export class AiGatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "AiGatewayError";
  }
}

function apiKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new AiGatewayError(500, "AI is not configured (missing gateway key).");
  return key;
}

function friendly(status: number, body: string): string {
  if (status === 429) return "AI rate limit reached. Please retry in a few seconds.";
  if (status === 402) return "AI credits exhausted. Add credits to continue using AI features.";
  return `AI request failed (${status}): ${body.slice(0, 400)}`;
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function chat(
  messages: ChatMessage[],
  opts: { model?: string; json?: boolean; temperature?: number } = {},
): Promise<string> {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey(),
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      messages,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[ai-gateway] ${res.status} ${body}`);
    throw new AiGatewayError(res.status, friendly(res.status, body));
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

/** Chat call that must return JSON. Tolerates fenced/partial output. */
export async function chatJson<T>(messages: ChatMessage[], model?: string): Promise<T> {
  const raw = await chat(messages, model ? { json: true, model } : { json: true });
  return parseLooseJson<T>(raw);
}

export function parseLooseJson<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new AiGatewayError(502, "The AI returned an unreadable response. Please retry.");
  }
}

export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${GATEWAY}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey(),
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000),
      encoding_format: "float",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[ai-gateway:embed] ${res.status} ${body}`);
    throw new AiGatewayError(res.status, friendly(res.status, body));
  }
  const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
  return data.data?.[0]?.embedding ?? [];
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
