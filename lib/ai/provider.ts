export type AiCompletion = {
  system: string;
  prompt: string;
};

export interface AiProvider {
  id: string;
  complete(input: AiCompletion): Promise<string>;
  embed(texts: string[]): Promise<number[][]>;
}

const EMBEDDING_DIMENSION = 1536;

export function embeddingDimension(): number {
  return EMBEDDING_DIMENSION;
}

export function toVectorLiteral(values: number[]): string {
  if (values.length !== EMBEDDING_DIMENSION || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding must be a finite 1536-dimension vector.");
  }
  return `[${values.join(",")}]`;
}

class OpenAiCompatibleProvider implements AiProvider {
  id = "openai-compatible";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly embeddingModel: string,
  ) {}

  async complete(input: AiCompletion): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI provider returned an empty completion");
    return content;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: this.embeddingModel, input: texts }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Embedding provider returned ${response.status}`);
    const body = (await response.json()) as { data?: { embedding?: number[]; index?: number }[] };
    const rows = body.data ?? [];
    rows.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return rows.map((row) => row.embedding ?? []);
  }
}

export function getAiProvider(): AiProvider | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAiCompatibleProvider(
    apiKey,
    (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    process.env.OPENAI_MODEL || "gpt-4.1-mini",
    process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
  );
}
