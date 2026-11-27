/**
 * Vercel AI Gateway (OpenAI-compatible Chat Completions). Auth: AI_GATEWAY_API_KEY (worker / CI) or the deployment's
 * VERCEL_OIDC_TOKEN. Returns a typed error instead of throwing so callers can fall back to rule-based behaviour.
 */
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ToolSpec = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };

export type ChatResult =
  | { ok: true; content: string; toolCalls: ToolCall[]; model: string }
  | { ok: false; error: string; code: "not_configured" | "billing" | "http" | "network" };

export const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1";

export function gatewayModel(): string {
  return process.env.AI_GATEWAY_MODEL || "google/gemini-2.5-flash";
}

export function gatewayToken(): string | null {
  return process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || null;
}

// After a billing / verification refusal, skip the gateway for a while so every chat message doesn't pay a failed round trip.
let blocked: { until: number; error: string } | null = null;
const BLOCK_MS = 30 * 60_000;

export async function chat(messages: ChatMessage[], options: { tools?: ToolSpec[]; json?: boolean; timeoutMs?: number } = {}): Promise<ChatResult> {
  const token = gatewayToken();
  if (!token) return { ok: false, code: "not_configured", error: "AI Gateway is not configured (AI_GATEWAY_API_KEY)." };
  if (blocked && blocked.until > Date.now()) return { ok: false, code: "billing", error: blocked.error };
  try {
    const response = await fetch(`${GATEWAY_URL}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: gatewayModel(),
        messages,
        temperature: 0.2,
        ...(options.tools?.length ? { tools: options.tools, tool_choice: "auto" } : {}),
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 45_000),
    });
    const body = (await response.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
      error?: { message?: string; type?: string };
      model?: string;
    };
    if (!response.ok) {
      const message = body.error?.message ?? `AI Gateway returned ${response.status}`;
      const billing = body.error?.type === "customer_verification_required" || /credit card|credits|budget/i.test(message);
      if (billing || response.status === 401 || response.status === 403) blocked = { until: Date.now() + BLOCK_MS, error: message };
      return { ok: false, code: billing ? "billing" : "http", error: message };
    }
    const msg = body.choices?.[0]?.message;
    return { ok: true, content: msg?.content ?? "", toolCalls: msg?.tool_calls ?? [], model: body.model ?? gatewayModel() };
  } catch (error) {
    return { ok: false, code: "network", error: error instanceof Error ? error.message : "AI Gateway request failed" };
  }
}
