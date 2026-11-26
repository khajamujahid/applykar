import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { APPLICATION_STATUSES, BOARD_SOURCES } from "@/lib/domain";
import { safeEqual } from "@/lib/secret";
import { getLatestCode, getVerifyLink } from "@/lib/inbox/store";
import { ingestBatch, isBoardSource } from "@/lib/ingest/run";
import { listApplications, queueApplication, updateApplicationStatus } from "@/lib/services/applications";
import { getJob, hideJob, listSaved, saveJob, searchJobs } from "@/lib/services/jobs";
import { ensureOwner, getAnswers, listProfiles, setActiveProfile, updateAnswers } from "@/lib/services/profiles";

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function authorized(request: Request): boolean {
  const expected = process.env.MCP_BEARER_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;
  return safeEqual(token, expected);
}

async function activeProfile() {
  return ensureOwner();
}

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "applykar", version: "0.1.0" });

  server.registerTool(
    "search_jobs",
    {
      description: "Search the active profile's job feed. Hard filters for leadership, W-2-only, location, and years still apply.",
      inputSchema: {
        query: z.string().optional(),
        workplace: z.enum(["remote", "hybrid", "onsite"]).optional(),
        source: z.enum(BOARD_SOURCES).optional(),
        postedWithinDays: z.number().int().positive().optional(),
        c2cOnly: z.boolean().optional(),
        includeLeadership: z.boolean().optional(),
      },
    },
    async (args) => {
      const profile = await activeProfile();
      const result = await searchJobs(profile.id, {
        q: args.query,
        workplace: args.workplace ? [args.workplace] : undefined,
        sources: args.source ? [args.source] : undefined,
        postedWithinDays: args.postedWithinDays,
        c2cOnly: args.c2cOnly,
        includeLeadership: args.includeLeadership,
      });
      return text({
        profileId: profile.id,
        total: result.total,
        jobs: result.jobs.map((job) => ({
          id: job.id,
          title: job.title,
          company: job.companyName,
          score: job.score,
          source: job.source,
          workplace: job.workplace,
          location: job.locationRaw,
          salary: job.salaryLabel,
          applyUrl: job.applyUrl,
        })),
      });
    },
  );

  server.registerTool(
    "get_job",
    { description: "Get one job for the active profile, including the description.", inputSchema: { id: z.string() } },
    async ({ id }) => {
      const profile = await activeProfile();
      const job = await getJob(profile.id, id);
      return text(job ?? { error: "Job not found" });
    },
  );

  server.registerTool(
    "list_saved",
    { description: "List jobs saved on the active profile.", inputSchema: {} },
    async () => {
      const profile = await activeProfile();
      const jobs = await listSaved(profile.id);
      return text(jobs.map((job) => ({ id: job.id, title: job.title, company: job.companyName, score: job.score })));
    },
  );

  server.registerTool(
    "save_job",
    { description: "Save or unsave a job on the active profile.", inputSchema: { id: z.string(), saved: z.boolean().optional() } },
    async ({ id, saved }) => {
      const profile = await activeProfile();
      await saveJob(profile.id, id, saved ?? true);
      return text({ ok: true, id, saved: saved ?? true });
    },
  );

  server.registerTool(
    "hide_job",
    { description: "Hide a job from the active profile's feed.", inputSchema: { id: z.string() } },
    async ({ id }) => {
      const profile = await activeProfile();
      await hideJob(profile.id, id, true);
      return text({ ok: true, id, hidden: true });
    },
  );

  server.registerTool(
    "queue_application",
    {
      description: "Queue a job, or mark it ready for review, on the active profile.",
      inputSchema: { jobId: z.string(), status: z.enum(["queued", "ready_for_review"]).optional() },
    },
    async ({ jobId, status }) => {
      const profile = await activeProfile();
      const application = await queueApplication(profile.id, jobId, status ?? "queued");
      return text({ id: application.id, status: application.status, title: application.title, company: application.companyName });
    },
  );

  server.registerTool(
    "list_applications",
    {
      description: "List applications for the active profile.",
      inputSchema: { status: z.enum(APPLICATION_STATUSES).optional() },
    },
    async ({ status }) => {
      const profile = await activeProfile();
      return text(await listApplications(profile.id, status));
    },
  );

  server.registerTool(
    "update_application_status",
    {
      description: "Update an application status. Applied can include proof text or a confirmation URL.",
      inputSchema: {
        id: z.string(),
        status: z.enum(APPLICATION_STATUSES),
        proofNote: z.string().optional(),
        proofUrl: z.string().optional(),
      },
    },
    async ({ id, status, proofNote, proofUrl }) => {
      const profile = await activeProfile();
      const application = await updateApplicationStatus(profile.id, id, status, { note: proofNote, url: proofUrl });
      return text({ id: application.id, status: application.status });
    },
  );

  server.registerTool(
    "get_profile",
    { description: "Get the active job profile, its filters, and saved answers.", inputSchema: {} },
    async () => {
      const profile = await activeProfile();
      const answers = await getAnswers(profile.id);
      const profiles = await listProfiles(profile.email);
      return text({ active: profile, answers, profiles: profiles.map((item) => ({ id: item.id, name: item.name })) });
    },
  );

  server.registerTool(
    "update_profile_answers",
    {
      description: "Replace saved answers on the active profile. These are the only source for visa, relocation, salary, and EEO questions.",
      inputSchema: {
        answers: z.array(z.object({ key: z.string(), question: z.string(), answer: z.string() })),
      },
    },
    async ({ answers }) => {
      const profile = await activeProfile();
      return text(await updateAnswers(profile.id, answers));
    },
  );

  server.registerTool(
    "list_profiles",
    { description: "List job-search profiles for the owner.", inputSchema: {} },
    async () => {
      const profile = await activeProfile();
      const profiles = await listProfiles(profile.email);
      return text(profiles.map((item) => ({ id: item.id, name: item.name, active: item.id === profile.id })));
    },
  );

  server.registerTool(
    "set_active_profile",
    { description: "Switch the active job-search profile.", inputSchema: { id: z.string() } },
    async ({ id }) => {
      const profile = await activeProfile();
      const next = await setActiveProfile(id, profile.email);
      return text({ id: next.id, name: next.name });
    },
  );

  server.registerTool(
    "get_verification_code",
    {
      description: "Latest verification code and confirm link for an employer on the active profile.",
      inputSchema: { employer: z.string(), profileId: z.string().optional() },
    },
    async ({ employer, profileId }) => {
      const profile = profileId ? await setActiveProfile(profileId) : await activeProfile();
      const code = await getLatestCode(profile.id, employer);
      const link = await getVerifyLink(profile.id, employer);
      return text({ code, link });
    },
  );

  server.registerTool(
    "trigger_ingest",
    {
      description: "Refresh jobs from public Greenhouse, Lever, Ashby, SmartRecruiters, and Workable boards.",
      inputSchema: {
        sources: z.array(z.enum(BOARD_SOURCES)).optional(),
        slugs: z.array(z.string()).optional(),
        limit: z.number().int().positive().max(30).optional(),
      },
    },
    async ({ sources, slugs, limit }) => {
      const stats = await ingestBatch({
        sources: sources?.filter(isBoardSource),
        slugs,
        limitCompanies: limit ?? 4,
        includeOptional: false,
      });
      return text(stats);
    },
  );

  return server;
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createMcpServer();
  await server.connect(transport);
  return transport.handleRequest(request);
}
