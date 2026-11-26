"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { hideJobAction, prepareJobAction, queueJobAction, saveJobAction, savePresetAction, startBulkApplyAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { JobFilters, JobSource, ScoredJob, Seniority, Workplace } from "@/lib/domain";
import { relativeTime } from "@/lib/domain";
import { companyFacts, jobFunction } from "@/lib/feed/listing";
import { filtersToQuery } from "@/lib/filters";

type BulkRun = {
  status: string;
  items: { id: string; title: string; companyName: string; status: string; detail: string | null; missingQuestions: string[] }[];
};

const workplaces: Workplace[] = ["remote", "hybrid", "onsite"];
const seniorities: Seniority[] = ["junior", "mid", "senior", "staff", "principal"];
const sources: JobSource[] = ["greenhouse", "lever", "ashby", "smartrecruiters", "workable", "workday", "icims", "recruitee", "bamboohr", "breezy", "rippling", "jazzhr"];

export function FeedView({
  jobs,
  total,
  selected,
  filters,
  presets,
  bulk,
}: {
  jobs: ScoredJob[];
  total: number;
  selected: ScoredJob | null;
  filters: JobFilters;
  presets: { id: string; name: string; query: string }[];
  bulk: BulkRun | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState(filters.q ?? "");
  // "New since last visit": remember the previous visit for this browser session, then stamp now.
  const [since, setSince] = useState<string | null>(null);
  useEffect(() => {
    let value = sessionStorage.getItem("ak_since");
    if (!value) {
      value = localStorage.getItem("ak_last_visit") ?? new Date(Date.now() - 24 * 3600_000).toISOString();
      sessionStorage.setItem("ak_since", value);
      localStorage.setItem("ak_last_visit", new Date().toISOString());
    }
    const stamp = value;
    const timer = window.setTimeout(() => setSince(stamp), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const newCount = since ? jobs.filter((job) => job.firstSeenAt && job.firstSeenAt > since).length : 0;
  const selectedIndex = Math.max(0, jobs.findIndex((job) => job.id === selected?.id));
  const active = jobs[selectedIndex] ?? selected;

  const href = useMemo(() => (next: JobFilters, jobId?: string | null) => `/feed${filtersToQuery(next, jobId)}`, []);

  function push(next: JobFilters, jobId?: string | null) {
    router.push(href(next, jobId ?? active?.id));
  }

  function toggle<T extends string>(list: T[] | undefined, value: T): T[] | undefined {
    const current = list ?? [];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    return next.length ? next : undefined;
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (!active) return;
      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        const delta = event.key === "j" ? 1 : -1;
        const next = jobs[Math.min(jobs.length - 1, Math.max(0, selectedIndex + delta))];
        if (next) router.push(href(filters, next.id));
      }
      if (event.key === "s") {
        event.preventDefault();
        start(async () => {
          await saveJobAction(active.id, !active.saved);
          toast.success(active.saved ? "Removed from saved" : "Saved");
          router.refresh();
        });
      }
      if (event.key === "h") {
        event.preventDefault();
        start(async () => {
          await hideJobAction(active.id);
          toast("Hidden from this profile");
          router.refresh();
        });
      }
      if (event.key === "a") {
        event.preventDefault();
        start(async () => {
          await queueJobAction(active.id);
          toast.success("Queued");
          router.refresh();
        });
      }
      if (event.key === "o") {
        event.preventDefault();
        window.open(active.applyUrl, "_blank", "noopener,noreferrer");
      }
      if (event.key === "/") {
        event.preventDefault();
        document.getElementById("job-search")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, filters, href, jobs, router, selectedIndex]);

  return (
    <div className="grid min-h-[calc(100vh-3rem)] lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-w-0 border-border lg:border-r">
        <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
          {(["recommended", "newest", "liked", "applied", "external"] as const).map((tab) => (
            <a
              key={tab}
              href={`/feed${filtersToQuery({ ...filters, tab }, active?.id)}`}
              className={`rounded-full px-2 py-1 capitalize ${filters.tab === tab || (!filters.tab && tab === "recommended") ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {tab}
            </a>
          ))}
          {newCount > 0 ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-600" data-testid="new-count">
              {newCount} new since last visit
            </span>
          ) : null}
          <BulkApply initial={bulk} />
        </div>
        <form
          className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const text = (name: string) => String(data.get(name) ?? "").trim();
            push({
              ...filters,
              q: query || undefined,
              title: text("title") || undefined,
              jobFunction: text("fn") || undefined,
              near: text("near") || undefined,
              radiusMiles: Number(text("radius")) || undefined,
              salaryFloor: Number(text("pay")) || undefined,
              includeText: text("include") || undefined,
              excludeText: text("exclude") || undefined,
              excludeCompanies: text("companies") || undefined,
              industry: text("industry") || undefined,
              companyStage: text("stage") || undefined,
              companySize: text("size") || undefined,
              excludeStaffing: data.get("agencies") !== "on",
              sponsorship: data.get("sponsor") === "on" ? "no" : undefined,
              yoeMax: Number(text("yoe")) || undefined,
            });
          }}
        >
          <Input
            id="job-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Title or company"
            className="h-7 w-44"
            aria-label="Search jobs"
          />
          {workplaces.map((place) => (
            <FilterChip
              key={place}
              active={filters.workplace?.includes(place) ?? false}
              onClick={() => push({ ...filters, workplace: toggle(filters.workplace, place) })}
              testId={place === "remote" ? "filter-remote" : undefined}
            >
              {place}
            </FilterChip>
          ))}
          {seniorities.map((level) => (
            <FilterChip
              key={level}
              active={filters.seniority?.includes(level) ?? false}
              onClick={() => push({ ...filters, seniority: toggle(filters.seniority, level) })}
            >
              {level}
            </FilterChip>
          ))}
          {sources.map((source) => (
            <FilterChip
              key={source}
              active={filters.sources?.includes(source) ?? false}
              onClick={() => push({ ...filters, sources: toggle(filters.sources, source) })}
              testId={source === "greenhouse" ? "filter-greenhouse" : undefined}
            >
              {source}
            </FilterChip>
          ))}
          <FilterChip active={filters.postedWithinDays === 1} onClick={() => push({ ...filters, postedWithinDays: filters.postedWithinDays === 1 ? undefined : 1 })}>
            24h
          </FilterChip>
          <FilterChip active={filters.postedWithinDays === 7} onClick={() => push({ ...filters, postedWithinDays: filters.postedWithinDays === 7 ? undefined : 7 })}>
            7d
          </FilterChip>
          <FilterChip active={Boolean(filters.c2cOnly)} onClick={() => push({ ...filters, c2cOnly: !filters.c2cOnly })}>
            C2C
          </FilterChip>
          <FilterChip active={Boolean(filters.hasSalary)} onClick={() => push({ ...filters, hasSalary: !filters.hasSalary })}>
            Has pay
          </FilterChip>
          <FilterChip active={Boolean(filters.includeW2Only)} onClick={() => push({ ...filters, includeW2Only: !filters.includeW2Only })}>
            Include W-2
          </FilterChip>
          <FilterChip active={Boolean(filters.includeLeadership)} onClick={() => push({ ...filters, includeLeadership: !filters.includeLeadership })}>
            Leadership
          </FilterChip>
          <FilterChip active={Boolean(filters.includeNonUs)} onClick={() => push({ ...filters, includeNonUs: !filters.includeNonUs })}>
            Anywhere
          </FilterChip>
          <Button type="submit" size="sm" variant="secondary" className="h-7">
            Apply
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => { setQuery(""); router.push("/feed"); }}>
            Clear
          </Button>
          <Input name="title" defaultValue={filters.title} placeholder="Title contains" className="h-7 w-32" />
          <Input name="fn" defaultValue={filters.jobFunction} placeholder="Function" className="h-7 w-28" />
          <Input name="near" defaultValue={filters.near} placeholder="Near city" className="h-7 w-28" />
          <Input name="radius" defaultValue={filters.radiusMiles ? String(filters.radiusMiles) : ""} placeholder="Miles" className="h-7 w-16" />
          <Input name="pay" defaultValue={filters.salaryFloor ? String(filters.salaryFloor) : ""} placeholder="Min pay" className="h-7 w-20" />
          <Input name="yoe" defaultValue={filters.yoeMax ? String(filters.yoeMax) : ""} placeholder="Max YOE" className="h-7 w-20" />
          <Input name="include" defaultValue={filters.includeText} placeholder="Include" className="h-7 w-24" />
          <Input name="exclude" defaultValue={filters.excludeText} placeholder="Exclude" className="h-7 w-24" />
          <Input name="companies" defaultValue={filters.excludeCompanies} placeholder="Exclude companies" className="h-7 w-36" />
          <Input name="industry" defaultValue={filters.industry} placeholder="Industry" className="h-7 w-24" />
          <Input name="stage" defaultValue={filters.companyStage} placeholder="Stage" className="h-7 w-24" />
          <Input name="size" defaultValue={filters.companySize} placeholder="Size" className="h-7 w-24" />
          <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <input type="checkbox" name="agencies" defaultChecked={filters.excludeStaffing === false} /> Show agencies
          </label>
          <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <input type="checkbox" name="sponsor" defaultChecked={filters.sponsorship === "no"} /> No sponsorship
          </label>
          <span className="ml-auto text-[12px] text-muted-foreground">{total} roles</span>
        </form>
        <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2 text-[12px]">
          {presets.map((preset) => (
            <a key={preset.id} href={`/feed?${preset.query}`} className="text-muted-foreground hover:text-foreground">
              {preset.name}
            </a>
          ))}
          <form action={savePresetAction} className="flex gap-1">
            <Input name="name" placeholder="Save filters" className="h-7 w-28" />
            <input type="hidden" name="query" value={filtersToQuery(filters).replace(/^\?/, "")} />
            <Button size="sm" variant="ghost" type="submit">Save</Button>
          </form>
        </div>
        {jobs.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-medium">No roles match this profile</p>
            <p className="mt-1 text-muted-foreground">Clear a filter, widen locations, or run an ingest from Settings.</p>
          </div>
        ) : (
          <ul>
            {jobs.map((job) => (
              <li key={job.id}>
                <button
                  type="button"
                  data-testid="job-card"
                  data-source={job.source}
                  onClick={() => router.push(href(filters, job.id))}
                  className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-3 border-b border-border px-3 py-3 text-left hover:bg-muted/40 ${job.id === active?.id ? "bg-muted/50" : ""}`}
                >
                  <Score value={job.score} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{job.title}</span>
                    <span className="mt-0.5 block truncate text-muted-foreground">
                      {job.companyName} · {job.locationRaw || job.workplace} · {job.source}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {since && job.firstSeenAt && job.firstSeenAt > since ? <Badge className="bg-emerald-600 text-white" data-testid="new-badge">New</Badge> : null}
                      {job.salaryLabel ? <Badge variant="outline">{job.salaryLabel}</Badge> : null}
                      {job.c2cFriendly ? <Badge variant="secondary">C2C</Badge> : null}
                      {job.noSponsorship ? <Badge variant="outline">No sponsorship</Badge> : null}
                      {job.applicationStatus ? <Badge>{job.applicationStatus.replaceAll("_", " ")}</Badge> : null}
                    </span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">{relativeTime(job.postedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <aside className="hidden min-w-0 px-4 py-4 lg:block">
        {active ? (
          <Detail
            job={active}
            pending={pending}
            onQueue={() =>
              start(async () => {
                await queueJobAction(active.id);
                toast.success("Queued for this profile");
                router.refresh();
              })
            }
            onPrepare={() => start(async () => prepareJobAction(active.id))}
            onSave={() =>
              start(async () => {
                await saveJobAction(active.id, !active.saved);
                router.refresh();
              })
            }
            onHide={() =>
              start(async () => {
                await hideJobAction(active.id);
                router.refresh();
              })
            }
          />
        ) : (
          <p className="text-muted-foreground">Select a role to see the description and apply actions.</p>
        )}
      </aside>
    </div>
  );
}

function Detail({
  job,
  pending,
  onQueue,
  onPrepare,
  onSave,
  onHide,
}: {
  job: ScoredJob;
  pending: boolean;
  onQueue: () => void;
  onPrepare: () => void;
  onSave: () => void;
  onHide: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div>
        <p className="text-[12px] text-muted-foreground">{job.companyName}</p>
        <h1 className="mt-1 text-base font-medium leading-snug">{job.title}</h1>
        <p className="mt-1 text-muted-foreground">
          {job.locationRaw || "Location not listed"} · {job.workplace} · {job.seniority}
        </p>
      </div>
      <div className="rounded-lg border border-border p-3 text-[12px]" data-testid="company-card">
        <p className="font-medium">{job.companyName}</p>
        <p className="text-muted-foreground">
          {jobFunction(job.title)}
          {companyFacts(job.companyName)
            ? ` · ${companyFacts(job.companyName)?.industry} · ${companyFacts(job.companyName)?.stage} · ${companyFacts(job.companyName)?.size}`
            : " · Size and stage not listed"}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" disabled={pending} data-testid="prepare-job" onClick={onPrepare}>
          Prepare
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} data-testid="queue-job" onClick={onQueue}>
          Queue
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={onSave}>
          {job.saved ? "Unsave" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={onHide}>
          Hide
        </Button>
        <Button size="sm" variant="outline" nativeButton={false} render={<a href={job.applyUrl} target="_blank" rel="noreferrer" />}>
          Open
        </Button>
      </div>
      <p className="text-[13px]">{job.why}</p>
      <p className="text-[12px] text-muted-foreground">
        Skills {job.breakdown.skills} · Experience {job.breakdown.experience} · Title {job.breakdown.title} · Location {job.breakdown.location}
      </p>
      <div className="flex flex-wrap gap-1">
        {job.skillTags.slice(0, 8).map((tag) => (
          <Badge key={tag} variant="outline">
            {tag}
          </Badge>
        ))}
      </div>
      {job.description ? <p className="whitespace-pre-wrap text-muted-foreground">{job.description.slice(0, 1800)}</p> : <p className="text-muted-foreground">Open the role for the full description.</p>}
    </div>
  );
}

function FilterChip({
  active,
  children,
  onClick,
  testId,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-active={active ? "true" : "false"}
      onClick={onClick}
      className={`h-7 rounded-full border px-2 capitalize ${active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

function Score({ value }: { value: number }) {
  return (
    <span className="grid size-9 place-items-center rounded-full border border-primary/40 text-[11px] font-medium text-primary">
      {value}
    </span>
  );
}

function BulkApply({ initial }: { initial: BulkRun | null }) {
  const [count, setCount] = useState(20);
  const [run, setRun] = useState<BulkRun | null>(initial);
  const status = run?.status;

  useEffect(() => {
    if (status !== "queued" && status !== "running") return;
    const timer = setInterval(() => {
      void fetch("/api/bulk/latest")
        .then(async (response) => {
          if (!response.ok) return null;
          return (await response.json()) as { run: BulkRun | null };
        })
        .then((payload) => {
          if (payload) setRun(payload.run);
        });
    }, 2000);
    return () => clearInterval(timer);
  }, [status]);

  async function refresh() {
    const response = await fetch("/api/bulk/latest");
    if (!response.ok) return;
    const payload = (await response.json()) as { run: BulkRun | null };
    setRun(payload.run);
  }

  return (
    <div className="ml-auto flex flex-wrap items-center gap-1" data-testid="bulk-panel">
      <input
        type="number"
        min={5}
        max={50}
        value={count}
        onChange={(event) => setCount(Math.min(50, Math.max(5, Number(event.target.value) || 20)))}
        className="h-7 w-14 rounded-md border border-border bg-transparent px-2"
        aria-label="How many roles to apply to"
        data-testid="bulk-count"
      />
      <Button
        size="sm"
        type="button"
        data-testid="bulk-apply"
        onClick={() => {
          void startBulkApplyAction(count).then(() => refresh());
        }}
      >
        Apply to top {count}
      </Button>
      {run?.items?.length ? (
        <div className="basis-full grid gap-1 pt-1 text-[12px] text-muted-foreground">
          {run.items.map((item) => (
            <p key={item.id}>
              {item.companyName} · {item.title} · {item.status}
              {item.missingQuestions?.length ? ` · missing ${item.missingQuestions.join(", ")}` : ""}
              {item.detail ? ` · ${item.detail.slice(0, 80)}` : ""}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}
