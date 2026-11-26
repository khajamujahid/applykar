import { signIn } from "@/auth";
import { ingestAction, saveImapAction, syncMailAction } from "@/app/actions";
import { ExtensionPair } from "@/components/extension-pair";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currentProfile } from "@/lib/current";
import { getGmailConnection } from "@/lib/inbox/connections";
import { getDb } from "@/lib/db/client";
import { companies, ingestRuns, jobs } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await currentProfile();
  const db = getDb();
  const [companyCount] = await db.select({ value: sql<number>`count(*)::int` }).from(companies);
  const [jobCount] = await db.select({ value: sql<number>`count(*)::int` }).from(jobs);
  const gmail = await getGmailConnection().catch(() => null);
  const runs = await db.select().from(ingestRuns).orderBy(desc(ingestRuns.startedAt)).limit(8);
  const flags = [
    ["Google sign-in", Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)],
    ["Allowlist", Boolean(process.env.ALLOWED_EMAILS)],
    ["OpenAI enrichment", Boolean(process.env.OPENAI_API_KEY)],
    ["Adzuna", Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY)],
    ["USAJobs", Boolean(process.env.USAJOBS_API_KEY)],
    ["JSearch", Boolean(process.env.JSEARCH_API_KEY)],
  ] as const;

  return (
    <div className="grid gap-6 px-4 py-4 lg:grid-cols-2">
      <section>
        <h1 className="text-base font-medium">Ingest</h1>
        <p className="mt-1 text-muted-foreground">
          {companyCount?.value ?? 0} company boards tracked · {jobCount?.value ?? 0} postings stored. Each run refreshes the oldest boards.
        </p>
        <form action={ingestAction} className="mt-3">
          <Button type="submit">Refresh a batch</Button>
        </form>
        <ul className="mt-4 grid gap-2 text-[12px] text-muted-foreground">
          {runs.length === 0 ? <li>No ingest runs yet.</li> : null}
          {runs.map((run) => (
            <li key={run.id}>
              {run.source} · {run.status} · +{run.added} / {run.updated} updated / {run.staled} stale
              {run.error ? ` · ${run.error}` : ""}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-sm font-medium">Connections</h2>
        <ul className="mt-3 grid gap-1 text-[13px]">
          {flags.map(([label, on]) => (
            <li key={label} className="flex justify-between border-b border-border py-1">
              <span>{label}</span>
              <span className={on ? "text-primary" : "text-muted-foreground"}>{on ? "Ready" : "Off"}</span>
            </li>
          ))}
        </ul>
        <h2 className="mt-6 text-sm font-medium">Shortcuts</h2>
        <p className="mt-2 text-muted-foreground">On the feed: j and k move, s saves, h hides, a queues, o opens the apply link, / focuses search, ⌘K opens the palette.</p>
        <h2 className="mt-6 text-sm font-medium">Mail</h2>
        <p className="mt-2 text-muted-foreground">Gmail is read-only. IMAP is the generic inbox. Both update codes, links, interviews, and rejections. The apply bot pulls fresh mail while a form waits for a code.</p>
        <p className="mt-1 text-[12px]">
          {gmail?.refreshToken ? `Gmail connected${gmail.email ? ` as ${gmail.email}` : ""}.` : "Gmail is not connected yet."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {process.env.AUTH_GOOGLE_ID ? (
            <form
              action={async () => {
                "use server";
                await signIn("gmail", { redirectTo: "/settings" });
              }}
            >
              <Button type="submit" variant="secondary">{gmail?.refreshToken ? "Reconnect Gmail" : "Connect Gmail"}</Button>
            </form>
          ) : (
            <p className="text-[12px] text-muted-foreground">Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET, then add the gmail.readonly scope.</p>
          )}
          <form action={syncMailAction}>
            <Button type="submit" variant="outline">Sync mail</Button>
          </form>
        </div>
        <form action={saveImapAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <Input name="host" placeholder="imap.gmail.com" />
          <Input name="port" placeholder="993" defaultValue="993" />
          <Input name="user" placeholder="IMAP user" />
          <Input name="password" type="password" placeholder="IMAP password" />
          <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" name="tls" defaultChecked /> TLS</label>
          <Button type="submit" variant="outline">Save IMAP</Button>
        </form>
        <h2 className="mt-6 text-sm font-medium">Chrome extension</h2>
        <p className="mt-2 text-muted-foreground">
          Create a pairing token, then paste it into the extension with this app URL. Greenhouse, Lever, Ashby, Workday, and iCIMS pages queue your apply worker. Other sites, including LinkedIn and Indeed, are saved for autofill only. You still submit those yourself.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <a
            href="/applykar-extension.zip"
            download
            className="inline-flex h-8 items-center rounded-md border px-3 text-[12px] font-medium hover:bg-muted"
          >
            Download extension (.zip)
          </a>
          <span className="text-[12px] text-muted-foreground">Unzip, open chrome://extensions, turn on Developer mode, then Load unpacked.</span>
        </div>
        <div className="mt-3">
          <ExtensionPair />
        </div>
        <h2 className="mt-6 text-sm font-medium">MCP</h2>
        <p className="mt-2 text-muted-foreground">
          Streamable HTTP for ChatGPT, Claude, Grok, or any MCP client. Tools follow the active profile.
        </p>
        <div className="mt-3 space-y-2 text-[12px]">
          <div>
            URL <code className="select-all rounded bg-muted px-1.5 py-0.5">{(process.env.APPLYKAR_URL || process.env.AUTH_URL || "").replace(/\/$/, "")}/api/mcp</code>
          </div>
          {process.env.MCP_BEARER_TOKEN ? (
            <details>
              <summary className="cursor-pointer text-muted-foreground">Show bearer token</summary>
              <code className="mt-1 block select-all break-all rounded bg-muted px-1.5 py-1">{process.env.MCP_BEARER_TOKEN}</code>
              <p className="mt-1 text-muted-foreground">Header: Authorization: Bearer &lt;token&gt;</p>
            </details>
          ) : (
            <p className="text-muted-foreground">Set MCP_BEARER_TOKEN to turn the MCP server on.</p>
          )}
        </div>
      </section>
    </div>
  );
}
