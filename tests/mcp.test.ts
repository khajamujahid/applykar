import { afterAll, beforeAll, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { applyMigrations } from "@/lib/db/migrate";
import { closeDb, getDb } from "@/lib/db/client";
import { handleMcpRequest } from "@/lib/mcp/handler";
import greenhouse from "./fixtures/greenhouse.json";

beforeAll(async () => {
  process.env.MCP_BEARER_TOKEN ||= "applykar-test-token";
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("applykar_test")) throw new Error("Refusing to migrate a non-test database");
  await applyMigrations(url);
  await getDb().execute(sql`TRUNCATE applications, job_states, standard_answers, ingest_runs, jobs, companies, owner_settings, profiles RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await closeDb();
});

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const response = await handleMcpRequest(
    new Request("http://applykar.test/api/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.MCP_BEARER_TOKEN}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }),
  );
  const body = (await response.json()) as { result?: { content?: { text?: string }[] }; error?: unknown };
  const text = body.result?.content?.[0]?.text ?? "";
  return { status: response.status, body, json: text ? (JSON.parse(text) as Record<string, unknown>) : null };
}

it("rejects a missing bearer token", async () => {
  const response = await handleMcpRequest(new Request("http://applykar.test/api/mcp", { method: "POST" }));
  expect(response.status).toBe(401);
});

it("ingests a recorded board and drives the active profile", async () => {
  const original = global.fetch;
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("boards-api.greenhouse.io")) {
      // The feed keeps 7 days of postings: make the recorded job fresh.
      const fresh = { ...greenhouse, jobs: greenhouse.jobs.map((job) => ({ ...job, first_published: new Date(Date.now() - 3_600_000).toISOString(), updated_at: new Date().toISOString() })) };
      return new Response(JSON.stringify(fresh), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("missing", { status: 404 });
  }) as typeof fetch;

  try {
    const ingested = await callTool("trigger_ingest", { sources: ["greenhouse"], slugs: ["netlify"], limit: 1 });
    expect(ingested.status).toBe(200);
    expect(ingested.json?.added).toBeGreaterThan(0);

    const found = await callTool("search_jobs", { query: "Demand", includeLeadership: true });
    const jobs = found.json?.jobs as { id: string; title: string }[];
    expect(jobs[0]?.title).toContain("Demand");
    const id = jobs[0]?.id ?? "";

    await callTool("save_job", { id });
    const saved = await callTool("list_saved");
    expect(JSON.stringify(saved.json)).toContain(id);

    const queued = await callTool("queue_application", { jobId: id });
    const applicationId = String(queued.json?.id);
    const listed = await callTool("list_applications", { status: "queued" });
    expect(JSON.stringify(listed.json)).toContain(applicationId);

    const updated = await callTool("update_application_status", {
      id: applicationId,
      status: "applied",
      proofNote: "Confirmation email",
    });
    expect(updated.json?.status).toBe("applied");

    const profile = await callTool("get_profile");
    expect(profile.json?.answers).toBeTruthy();
    await callTool("update_profile_answers", {
      answers: [{ key: "availability", question: "When can you start?", answer: "Available immediately." }],
    });
    await callTool("hide_job", { id });
    const hidden = await callTool("search_jobs", { query: "Demand", includeLeadership: true });
    expect(JSON.stringify(hidden.json?.jobs ?? [])).not.toContain(id);
  } finally {
    global.fetch = original;
  }
});
