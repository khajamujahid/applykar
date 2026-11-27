"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bookmark, ChevronDown, ExternalLink, Loader2, Search, SlidersHorizontal, X, Zap } from "lucide-react";
import { saveJobAction } from "@/app/actions";
import { AiPanel, type ChatMessageView } from "@/components/jobs/ai-panel";
import { JobDetail } from "@/components/jobs/job-detail";
import { AllFilters } from "@/components/jobs/all-filters";
import { CompanyLogo, MatchRing, StatusPill, Tag, timeAgo } from "@/components/app/bits";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ApplicationStatus, JobFilters, JobType, ScoredJob, Workplace } from "@/lib/domain";
import { JOB_TYPE_LABEL } from "@/lib/domain";
import { POSTED_OPTIONS, filtersToQuery } from "@/lib/filters";

export type CardStatus = { id?: string; status: ApplicationStatus; missing?: number };

export function salaryText(job: Pick<ScoredJob, "salaryLabel" | "salaryInterval">): string | null {
  if (!job.salaryLabel) return null;
  return job.salaryInterval === "hour" || /\/hr/.test(job.salaryLabel) ? job.salaryLabel : `${job.salaryLabel.replace(/\s*-\s*/, "–")}/yr`;
}

export function locationText(job: Pick<ScoredJob, "locationRaw" | "workplace" | "city" | "region">): string {
  if (job.workplace === "remote") return job.region || job.city ? `Remote · ${[job.city, job.region].filter(Boolean).join(", ")}` : "Remote, US";
  return job.locationRaw || [job.city, job.region].filter(Boolean).join(", ") || "United States";
}

export function useApply(initial: Record<string, CardStatus>) {
  const [statuses, setStatuses] = useState<Record<string, CardStatus>>(initial);
  const apply = useCallback(async (jobIds: string[]) => {
    setStatuses((s) => ({ ...s, ...Object.fromEntries(jobIds.map((id) => [id, { status: "queued" as const }])) }));
    const res = await fetch("/api/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobIds }) });
    const body = (await res.json().catch(() => ({}))) as { queued?: { jobId: string; id: string; status: ApplicationStatus }[] };
    setStatuses((s) => ({ ...s, ...Object.fromEntries((body.queued ?? []).map((q) => [q.jobId, { id: q.id, status: q.status }])) }));
  }, []);
  const active = Object.entries(statuses).filter(([, v]) => v.status === "queued" || v.status === "applying").map(([k]) => k);
  const key = active.join(",");
  useEffect(() => {
    if (!key) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/apply/status?jobs=${key}`);
      if (!res.ok) return;
      const body = (await res.json()) as Record<string, CardStatus>;
      setStatuses((s) => ({ ...s, ...body }));
    }, 3500);
    return () => clearInterval(timer);
  }, [key]);
  return { statuses, apply, merge: (more: Record<string, CardStatus>) => setStatuses((s) => ({ ...more, ...s })) };
}

export function JobsView({
  jobs,
  total,
  newSinceVisit,
  filters,
  selectedId,
  firstName,
  initialMessages,
}: {
  jobs: ScoredJob[];
  total: number;
  newSinceVisit: number;
  filters: JobFilters;
  selectedId: string | null;
  firstName: string;
  initialMessages: ChatMessageView[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(selectedId);
  const [saved, setSaved] = useState<Record<string, boolean>>(() => Object.fromEntries(jobs.map((j) => [j.id, j.saved])));
  const [q, setQ] = useState(filters.q ?? "");
  const [allOpen, setAllOpen] = useState(false);
  const initial = useMemo(
    () => Object.fromEntries(jobs.filter((j) => j.applicationStatus).map((j) => [j.id, { id: j.applicationId ?? undefined, status: j.applicationStatus! }])),
    [jobs],
  );
  const { statuses, apply, merge } = useApply(initial);
  useEffect(() => {
    merge(initial);
  }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  const listRef = useRef<HTMLDivElement>(null);

  const push = useCallback(
    (next: JobFilters) => {
      startTransition(() => router.push(`${pathname}${filtersToQuery({ ...next, limit: undefined })}`, { scroll: false }));
      listRef.current?.scrollTo({ top: 0 });
    },
    [pathname, router],
  );

  const postedLabel = POSTED_OPTIONS.find((o) => o.hours === filters.postedWithinHours)?.label ?? "Past week";
  const selectedJob = jobs.find((j) => j.id === selected) ?? null;

  return (
    <div className="flex h-full">
      <AiPanel firstName={firstName} newCount={newSinceVisit} initialMessages={initialMessages} onOpenJob={setSelected} onNavigate={(href) => startTransition(() => router.push(href))} onQueued={() => router.refresh()} />
      <section className="flex min-w-0 flex-1 flex-col bg-[#fbfbfd]">
        <div className="space-y-3 border-b border-border bg-white px-5 pb-3 pt-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              push({ ...filters, q: q.trim() || undefined });
            }}
            className="flex h-9 max-w-[420px] items-center gap-2 rounded-lg border border-input bg-white px-3 focus-within:ring-2 focus-within:ring-primary/20"
          >
            <Search className="size-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Job title or keyword" className="h-full flex-1 bg-transparent text-[13px] outline-none" />
            {q ? (
              <button type="button" onClick={() => (setQ(""), push({ ...filters, q: undefined }))} aria-label="Clear search">
                <X className="size-3.5 text-muted-foreground" />
              </button>
            ) : null}
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <Dropdown label={`Date posted: ${postedLabel.replace("Past ", "Past ")}`} active={Boolean(filters.postedWithinHours)}>
              {POSTED_OPTIONS.map((o) => (
                <Choice key={o.value} active={(filters.postedWithinHours ?? 168) === o.hours} onClick={() => push({ ...filters, postedWithinHours: o.hours === 168 ? undefined : o.hours })}>
                  {o.label}
                </Choice>
              ))}
            </Dropdown>
            <Dropdown label={filters.yoeMax ? `Experience: ${filters.yoeMax}${filters.yoeMax >= 10 ? "+" : ""} years` : "Experience"} active={Boolean(filters.yoeMax)}>
              <Choice active={!filters.yoeMax} onClick={() => push({ ...filters, yoeMax: undefined })}>
                Any experience
              </Choice>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <Choice key={n} active={filters.yoeMax === n} onClick={() => push({ ...filters, yoeMax: n })}>
                  {n === 10 ? "10+ years" : `${n} year${n > 1 ? "s" : ""}`}
                </Choice>
              ))}
            </Dropdown>
            <Dropdown label={filters.jobTypes?.length ? `Job type: ${filters.jobTypes.map((t) => JOB_TYPE_LABEL[t]).join(", ")}` : "Job type"} active={Boolean(filters.jobTypes?.length)}>
              {(Object.keys(JOB_TYPE_LABEL) as JobType[]).map((t) => {
                const on = filters.jobTypes?.includes(t) ?? false;
                const next = on ? (filters.jobTypes ?? []).filter((x) => x !== t) : [...(filters.jobTypes ?? []), t];
                return (
                  <Choice key={t} active={on} onClick={() => push({ ...filters, jobTypes: next.length ? next : undefined })}>
                    {JOB_TYPE_LABEL[t]}
                  </Choice>
                );
              })}
            </Dropdown>
            <Dropdown label={filters.workplace?.length ? `Remote: ${filters.workplace.map(cap).join(", ")}` : "Remote"} active={Boolean(filters.workplace?.length)}>
              {(["remote", "hybrid", "onsite"] as Workplace[]).map((w) => {
                const on = filters.workplace?.includes(w) ?? false;
                const next = on ? (filters.workplace ?? []).filter((x) => x !== w) : [...(filters.workplace ?? []), w];
                return (
                  <Choice key={w} active={on} onClick={() => push({ ...filters, workplace: next.length ? next : undefined })}>
                    {w === "onsite" ? "On-site" : cap(w)}
                  </Choice>
                );
              })}
            </Dropdown>
            <LocationDropdown value={filters.near} onChange={(near) => push({ ...filters, near, radiusMiles: undefined })} />
            <button type="button" onClick={() => setAllOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-white px-3 text-[12.5px] hover:bg-muted">
              <SlidersHorizontal className="size-3.5" /> All filters
            </button>
            {pending ? <Loader2 className="size-4 animate-spin text-primary" /> : null}
          </div>
          <p className="text-[13px] text-muted-foreground">
            <span className="font-semibold text-foreground">Jobs</span> · {total.toLocaleString()} results ·{" "}
            <span className="font-medium text-primary">{newSinceVisit.toLocaleString()} new since last visit</span>
          </p>
        </div>
        <div ref={listRef} className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 py-4">
          {jobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-white p-10 text-center text-muted-foreground">No jobs match these filters. Try a longer date range.</div>
          ) : null}
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              active={job.id === selected}
              saved={saved[job.id] ?? false}
              status={statuses[job.id]}
              onOpen={() => setSelected(job.id)}
              onSave={() => {
                const next = !(saved[job.id] ?? false);
                setSaved((s) => ({ ...s, [job.id]: next }));
                void saveJobAction(job.id, next);
              }}
              onApply={() => void apply([job.id])}
            />
          ))}
          {jobs.length >= (filters.limit ?? 60) ? (
            <div className="flex justify-center py-3">
              <button
                type="button"
                onClick={() => startTransition(() => router.push(`${pathname}${filtersToQuery({ ...filters, limit: (filters.limit ?? 60) + 60 })}`, { scroll: false }))}
                className="rounded-lg border border-input bg-white px-4 py-2 text-[12.5px] hover:bg-muted"
              >
                Show more jobs
              </button>
            </div>
          ) : null}
        </div>
      </section>
      {selected ? (
        <JobDetail
          key={selected}
          jobId={selected}
          initial={selectedJob}
          status={statuses[selected]}
          onClose={() => setSelected(null)}
          onApply={() => void apply([selected])}
        />
      ) : null}
      <AllFilters key={allOpen ? JSON.stringify(filters) : "closed"} open={allOpen} onOpenChange={setAllOpen} filters={filters} onApply={(next) => (setAllOpen(false), push(next))} />
    </div>
  );
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}

export function ApplyControl({ status, onApply, applicationId, full = false }: { status?: CardStatus; onApply: () => void; applicationId?: string | null; full?: boolean }) {
  const base = full ? "h-10 w-full justify-center text-[14px]" : "h-8 px-3.5 text-[13px]";
  if (!status || status.status === "withdrawn")
    return (
      <button
        type="button"
        onClick={(e) => (e.stopPropagation(), onApply())}
        className={`inline-flex items-center gap-1.5 rounded-lg bg-primary font-medium text-white shadow-sm transition hover:bg-[#3d2fc0] ${base}`}
      >
        <Zap className="size-3.5 fill-white" /> Apply
      </button>
    );
  if (status.status === "queued" || status.status === "applying")
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-lg border border-[#d9d4fb] bg-[#f4f2fe] font-medium text-[#3d30b8] ${base}`}>
        <Loader2 className="size-3.5 animate-spin" /> {status.status === "queued" ? "Queued…" : "Applying…"}
      </span>
    );
  const href = status.id || applicationId ? `/applications/${status.id ?? applicationId}` : "/applications";
  return (
    <a href={href} onClick={(e) => e.stopPropagation()} className={full ? "flex justify-center" : ""}>
      <StatusPill status={status.status} />
    </a>
  );
}

function JobCard({
  job,
  active,
  saved,
  status,
  onOpen,
  onSave,
  onApply,
}: {
  job: ScoredJob;
  active: boolean;
  saved: boolean;
  status?: CardStatus;
  onOpen: () => void;
  onSave: () => void;
  onApply: () => void;
}) {
  const salary = salaryText(job);
  return (
    <article
      onClick={onOpen}
      className={`group relative flex cursor-pointer gap-4 rounded-xl border bg-white px-4 py-3.5 transition hover:border-[#cfc9f5] hover:shadow-[0_2px_10px_rgba(74,59,212,0.06)] ${
        active ? "border-[#bdb4f4] shadow-[0_2px_12px_rgba(74,59,212,0.10)]" : "border-border"
      }`}
    >
      <CompanyLogo name={job.companyName} size={46} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-semibold leading-tight">{job.title}</h3>
        <p className="mt-0.5 truncate text-[12.5px] text-[#3f3e55]">{job.companyName}</p>
        <div className="mt-0.5 flex flex-wrap gap-x-8 gap-y-0.5 text-[12.5px] text-[#3f3e55]">
          <span className="truncate">{locationText(job)}</span>
          {salary ? <span className="font-medium text-foreground">{salary}</span> : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {job.isNew ? <Tag tone="green">New</Tag> : null}
          {job.yoeMin != null ? <Tag>{job.yoeMin}+ yrs</Tag> : null}
          <Tag>{JOB_TYPE_LABEL[job.jobType]}</Tag>
          {job.postedAt ? <span className="ml-2 text-[12px] text-muted-foreground">posted {timeAgo(job.postedAt).replace("Yesterday", "1 day ago")}</span> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-5">
        <MatchRing score={job.score} />
        <div className="flex w-[118px] flex-col items-end gap-3">
          <button
            type="button"
            aria-label={saved ? "Remove bookmark" : "Bookmark"}
            onClick={(e) => (e.stopPropagation(), onSave())}
            className="rounded p-0.5 text-[#3f3e55] hover:text-primary"
          >
            <Bookmark className={`size-[17px] ${saved ? "fill-primary text-primary" : ""}`} strokeWidth={1.8} />
          </button>
          <ApplyControl status={status} onApply={onApply} applicationId={job.applicationId} />
        </div>
      </div>
    </article>
  );
}

function Dropdown({ label, active, children }: { label: string; active?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] transition hover:bg-muted ${
          active ? "border-[#bdb4f4] bg-[#f6f4ff] text-[#2f2496]" : "border-input bg-white"
        }`}
      >
        {label}
        <ChevronDown className="size-3.5 opacity-70" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 gap-0 p-1" onClick={() => setOpen(false)}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

function Choice({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[12.5px] hover:bg-muted ${active ? "font-medium text-primary" : ""}`}>
      {children}
      {active ? <span className="size-1.5 rounded-full bg-primary" /> : null}
    </button>
  );
}

const CITY_CHOICES = ["Remote", "New York", "San Francisco", "Seattle", "Austin", "Boston", "Chicago", "Dallas", "Atlanta", "Denver", "Los Angeles", "Connecticut", "New Jersey", "Texas", "California"];

function LocationDropdown({ value, onChange }: { value?: string; onChange: (value?: string) => void }) {
  const [text, setText] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] hover:bg-muted ${value ? "border-[#bdb4f4] bg-[#f6f4ff] text-[#2f2496]" : "border-input bg-white"}`}
      >
        {value ? `Location: ${value}` : "Location"}
        <ChevronDown className="size-3.5 opacity-70" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 gap-1 p-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setOpen(false);
            onChange(text.trim() || undefined);
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="City, state…" className="h-8 w-full rounded-md border border-input px-2 text-[12.5px] outline-none focus:border-primary" />
        </form>
        <div className="max-h-56 overflow-y-auto">
          <Choice active={!value} onClick={() => (setOpen(false), setText(""), onChange(undefined))}>
            Anywhere in the US
          </Choice>
          {CITY_CHOICES.map((c) => (
            <Choice key={c} active={value === c} onClick={() => (setOpen(false), setText(c), onChange(c))}>
              {c}
            </Choice>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { ExternalLink };
