/**
 * Applykar AI (Jobs page). Uses the Vercel AI Gateway with tools when it's available; otherwise a deterministic
 * intent parser does the same things (search, filter, best matches, queue applies), so the chat always works.
 */
import { desc, eq } from "drizzle-orm";
import { chat, type ChatMessage, type ToolSpec } from "@/lib/ai/gateway";
import { getDb } from "@/lib/db/client";
import { aiMessages } from "@/lib/db/schema";
import type { JobFilters, ProfileRecord, ScoredJob, Workplace } from "@/lib/domain";
import { filtersToQuery } from "@/lib/filters";
import { queueApply } from "@/lib/apply/pipeline";
import { searchJobs } from "@/lib/services/jobs";

export type AssistantJob = { id: string; title: string; companyName: string; score: number; salary: string | null; location: string | null };
export type AssistantReply = { reply: string; jobs?: AssistantJob[]; navigate?: string; queued?: number; engine: string };

const brief = (j: ScoredJob): AssistantJob => ({ id: j.id, title: j.title, companyName: j.companyName, score: j.score, salary: j.salaryLabel, location: j.locationRaw });

type SearchArgs = { query?: string; remote?: boolean; minSalary?: number; postedHours?: number; maxYears?: number };

function toFilters(args: SearchArgs): JobFilters {
  return {
    q: args.query?.trim() || undefined,
    workplace: args.remote ? (["remote"] as Workplace[]) : undefined,
    salaryFloor: args.minSalary && args.minSalary > 0 ? args.minSalary : undefined,
    postedWithinHours: args.postedHours,
    yoeMax: args.maxYears,
    limit: 20,
  };
}

async function runSearch(profile: ProfileRecord, args: SearchArgs) {
  const filters = toFilters(args);
  const result = await searchJobs(profile.id, filters);
  return { filters, result };
}

async function applyTop(profile: ProfileRecord, count: number, args: SearchArgs = {}): Promise<{ queued: number; jobs: ScoredJob[] }> {
  const { result } = await runSearch(profile, args);
  const picked = result.jobs.filter((j) => !j.applicationStatus || j.applicationStatus === "failed").slice(0, Math.min(50, count));
  for (const job of picked) await queueApply(profile.id, job.id);
  return { queued: picked.length, jobs: picked };
}

/** Rules fallback: understands the suggestion chips and common phrasings. */
export function parseIntent(text: string): { kind: "search" | "apply" | "best" | "help"; args: SearchArgs; count?: number } {
  const t = text.toLowerCase();
  const salary = /\$?\s?(\d{2,3})\s?k\+?/.exec(t);
  const hours = /(?:past|last)\s+(\d+)\s*(hour|hr|h|day|d|week|w)/.exec(t);
  const years = /(\d+)\+?\s*(?:years|yrs|yoe)/.exec(t);
  const known = /(senior|staff|lead|principal|junior)?\s*(python|java|javascript|typescript|react|node|data|ml|machine learning|ai|backend|front ?end|full ?stack|devops|cloud|sre|security|product|analyst|qa|android|ios|golang|go|rust|\.net|c#|salesforce|sap)\s*(developer|engineer|scientist|analyst|manager)?/.exec(t);
  const args: SearchArgs = {
    query: known ? known[0].replace(/\s+/g, " ").trim().replace(/\b(developer|engineer)s?\b/, "").trim() || known[0].trim() : undefined,
    remote: /\bremote\b/.test(t) || undefined,
    minSalary: salary ? Number(salary[1]) * 1000 : undefined,
    postedHours: hours ? Number(hours[1]) * ({ hour: 1, hr: 1, h: 1, day: 24, d: 24, week: 168, w: 168 } as Record<string, number>)[hours[2]] : undefined,
    maxYears: years ? Number(years[1]) : undefined,
  };
  const applyCount = /apply\s+(?:to\s+)?(?:the\s+)?(?:top\s+)?(\d+)/.exec(t);
  if (applyCount || /\bapply\b/.test(t)) return { kind: "apply", args, count: applyCount ? Number(applyCount[1]) : 5 };
  if (/best|top match|highest match/.test(t)) return { kind: "best", args };
  if (/find|show|search|jobs?|roles?|openings?|positions?/.test(t)) return { kind: "search", args };
  return { kind: "help", args };
}

async function rulesReply(profile: ProfileRecord, text: string, note?: string): Promise<AssistantReply> {
  const intent = parseIntent(text);
  const engine = note ? `rules (${note})` : "rules";
  if (intent.kind === "apply") {
    const { queued, jobs } = await applyTop(profile, intent.count ?? 5, intent.args);
    return {
      reply: queued
        ? `Queued ${queued} application${queued > 1 ? "s" : ""}. Each one gets a resume tailored to its job description, then the form is filled in the background. Watch the status on each card.`
        : "I couldn't find new jobs to queue with those filters.",
      jobs: jobs.map(brief),
      queued,
      engine,
    };
  }
  if (intent.kind === "help")
    return {
      reply: "I can find jobs (\"senior python remote $120k+\"), show your best matches, or queue applications (\"apply to top 20\"). What should I do?",
      engine,
    };
  const { filters, result } = await runSearch(profile, intent.args);
  const label = [intent.args.query, intent.args.remote ? "remote" : "", intent.args.minSalary ? `$${intent.args.minSalary / 1000}k+` : ""].filter(Boolean).join(", ");
  return {
    reply: result.total
      ? `Found ${result.total.toLocaleString()} ${label ? `${label} ` : ""}jobs. ${intent.kind === "best" ? "Here are your highest matches:" : "Top matches:"}`
      : "No jobs match that yet. Try a broader title or a longer date range.",
    jobs: result.jobs.slice(0, 5).map(brief),
    navigate: `/feed${filtersToQuery({ ...filters, limit: undefined })}`,
    engine,
  };
}

const TOOLS: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "search_jobs",
      description: "Search the user's US job feed (last 7 days). Returns total and the top matches with match scores.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Title or keyword, e.g. 'senior python'" },
          remote: { type: "boolean" },
          minSalary: { type: "number", description: "Minimum yearly salary in USD" },
          postedHours: { type: "number", enum: [1, 3, 5, 24, 72, 168] },
          maxYears: { type: "number", description: "Max years of experience required" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_to_top_jobs",
      description: "Queue background applications (tailored resume per job) for the top N matching jobs.",
      parameters: {
        type: "object",
        properties: { count: { type: "number" }, query: { type: "string" }, remote: { type: "boolean" }, minSalary: { type: "number" } },
        required: ["count"],
      },
    },
  },
];

export async function history(profileId: string, limit = 30): Promise<{ role: string; content: string; createdAt: string }[]> {
  const rows = await getDb().select().from(aiMessages).where(eq(aiMessages.profileId, profileId)).orderBy(desc(aiMessages.id)).limit(limit);
  return rows.reverse().map((r) => ({ role: r.role, content: r.content, createdAt: r.createdAt.toISOString() }));
}

export async function clearHistory(profileId: string) {
  await getDb().delete(aiMessages).where(eq(aiMessages.profileId, profileId));
}

export async function respond(profile: ProfileRecord, text: string, firstName: string): Promise<AssistantReply> {
  const db = getDb();
  await db.insert(aiMessages).values({ profileId: profile.id, role: "user", content: text.slice(0, 2000) });
  const past = await history(profile.id, 12);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are Applykar AI, a job-search assistant for ${firstName}. Target titles: ${profile.targetTitles.join(", ") || "n/a"}. Skills: ${profile.skills.slice(0, 25).join(", ")}. Use tools to search jobs or queue applications; never invent jobs. Be brief (2-3 sentences).`,
    },
    ...past.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }) as ChatMessage),
  ];
  let reply: AssistantReply | null = null;
  const first = await chat(messages, { tools: TOOLS, timeoutMs: 25_000 });
  if (first.ok) {
    let jobs: AssistantJob[] | undefined;
    let navigate: string | undefined;
    let queued: number | undefined;
    if (first.toolCalls.length) {
      const toolMessages: ChatMessage[] = [{ role: "assistant", content: first.content || null, tool_calls: first.toolCalls }];
      for (const call of first.toolCalls) {
        const args = JSON.parse(call.function.arguments || "{}") as SearchArgs & { count?: number };
        if (call.function.name === "apply_to_top_jobs") {
          const done = await applyTop(profile, args.count ?? 5, args);
          queued = done.queued;
          jobs = done.jobs.map(brief);
          toolMessages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ queued: done.queued, jobs: jobs.slice(0, 10) }) });
        } else {
          const { filters, result } = await runSearch(profile, args);
          jobs = result.jobs.slice(0, 5).map(brief);
          navigate = `/feed${filtersToQuery({ ...filters, limit: undefined })}`;
          toolMessages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ total: result.total, top: jobs }) });
        }
      }
      const second = await chat([...messages, ...toolMessages], { timeoutMs: 25_000 });
      reply = { reply: second.ok ? second.content : "Done.", jobs, navigate, queued, engine: `ai-gateway:${first.model}` };
    } else reply = { reply: first.content, engine: `ai-gateway:${first.model}` };
  } else {
    reply = await rulesReply(profile, text, first.code === "billing" ? "AI Gateway needs a card on file" : first.code === "not_configured" ? "AI not configured" : "AI unavailable");
  }
  await db.insert(aiMessages).values({ profileId: profile.id, role: "assistant", content: reply.reply.slice(0, 4000) });
  return reply;
}
