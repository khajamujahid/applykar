import { createRequire } from "node:module";
import { afterAll, beforeAll, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { POST as capture } from "@/app/api/extension/capture/route";
import { applyMigrations } from "@/lib/db/migrate";
import { closeDb, getDb } from "@/lib/db/client";
import { createExtensionToken } from "@/lib/extension/auth";
import { bulkItems } from "@/lib/db/schema";

const require = createRequire(import.meta.url);
const page = require("../extension/page-logic.js") as {
  isHandsOffHost: (url: string) => boolean;
  serverApplySource: (url: string) => string | null;
  extractJob: (input: Record<string, unknown>) => { title: string; company: string; location: string };
  planAutofill: (labels: string[], answers: { key: string; answer: string }[]) => { filled: { label: string; value: string }[]; skipped: string[] };
};

it("keeps LinkedIn and Indeed off the apply worker", () => {
  expect(page.isHandsOffHost("https://www.linkedin.com/jobs/view/123")).toBe(true);
  expect(page.serverApplySource("https://www.indeed.com/viewjob?jk=abc")).toBeNull();
  expect(page.serverApplySource("https://boards.greenhouse.io/stripe/jobs/1")).toBe("greenhouse");
  expect(page.serverApplySource("https://jobs.lever.co/linear/abc")).toBe("lever");
  expect(page.serverApplySource("https://jobs.ashbyhq.com/notion/abc")).toBe("ashby");
});

it("extracts the posting and leaves unknown questions blank", () => {
  const job = page.extractJob({
    url: "https://jobs.lever.co/linear/abc",
    title: "Engineer at Linear",
    headings: ["Senior Engineer"],
    company: "Linear",
    location: "Remote",
    text: "Build the product. Remote.",
  });
  expect(job.title).toBe("Senior Engineer");
  expect(job.company).toBe("Linear");
  expect(job.location).toBe("Remote");
  const plan = page.planAutofill(
    ["Are you authorized to work in the United States?", "Favorite pizza topping"],
    [{ key: "work_authorization", answer: "Yes. I am a permanent resident." }],
  );
  expect(plan.filled).toEqual([
    { label: "Are you authorized to work in the United States?", value: "Yes. I am a permanent resident." },
  ]);
  expect(plan.skipped).toEqual(["Favorite pizza topping"]);
});

beforeAll(async () => {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("applykar_test")) throw new Error("Refusing to migrate a non-test database");
  await applyMigrations(url);
  await getDb().execute(
    sql`TRUNCATE bulk_items, bulk_runs, inbox_messages, extension_tokens, applications, job_states, standard_answers, ingest_runs, jobs, companies, owner_settings, profiles RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await closeDb();
});

it("saves a captured job and queues only worker-supported boards", async () => {
  const token = await createExtensionToken("extension-test");
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const greenhouse = await capture(
    new Request("http://applykar.test/api/extension/capture", {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: "https://boards.greenhouse.io/stripe/jobs/1",
        title: "Backend Engineer",
        company: "Stripe",
        location: "Remote - US",
        description: "Build APIs with SQL.",
      }),
    }),
  );
  const saved = (await greenhouse.json()) as { queued?: boolean; jobId?: string };
  expect(greenhouse.status).toBe(200);
  expect(saved.queued).toBe(true);

  const linkedin = await capture(
    new Request("http://applykar.test/api/extension/capture", {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: "https://www.linkedin.com/jobs/view/99",
        title: "Backend Engineer",
        company: "Example",
        location: "Remote",
        description: "A role the user opened.",
      }),
    }),
  );
  const manual = (await linkedin.json()) as { queued?: boolean };
  expect(manual.queued).toBe(false);

  const denied = await capture(
    new Request("http://applykar.test/api/extension/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", title: "Role", company: "Acme" }),
    }),
  );
  expect(denied.status).toBe(401);

  const queued = await getDb().select().from(bulkItems);
  expect(queued).toHaveLength(1);
  expect(queued[0]?.applyUrl).toContain("greenhouse.io");
});
