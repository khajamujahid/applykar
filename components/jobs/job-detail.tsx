"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";
import { CompanyLogo, Tag, timeAgo } from "@/components/app/bits";
import { ApplyControl, type CardStatus, locationText, salaryText } from "@/components/jobs/jobs-view";
import type { ScoredJob } from "@/lib/domain";
import { JOB_TYPE_LABEL } from "@/lib/domain";

type Sections = { about: string[]; responsibilities: string[]; qualifications: string[]; benefits: string[]; pay: string[] };

export function JobDetail({ jobId, initial, status, onClose, onApply }: { jobId: string; initial: ScoredJob | null; status?: CardStatus; onClose: () => void; onApply: () => void }) {
  const [data, setData] = useState<{ job: ScoredJob; sections: Sections } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetch(`/api/jobs/${jobId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => alive && setData(body))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [jobId]);
  const job = data?.job ?? initial;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!job) return null;
  const salary = salaryText(job);
  const s = data?.sections;
  const link = job.sourceUrl || job.applyUrl;
  return (
    <aside className="fixed bottom-0 right-0 top-12 z-40 flex w-full max-w-[440px] flex-col border-l border-border bg-white shadow-[-12px_0_32px_rgba(22,21,43,0.08)]">
      <div className="flex justify-end gap-1 px-3 pt-2.5">
        <a href={link} target="_blank" rel="noreferrer" className="rounded p-1.5 text-[#3f3e55] hover:bg-muted" aria-label="Open original job">
          <ExternalLink className="size-[17px]" />
        </a>
        <button type="button" onClick={onClose} className="rounded p-1.5 text-[#3f3e55] hover:bg-muted" aria-label="Close">
          <X className="size-[18px]" />
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 pb-8">
        <div className="flex gap-4">
          <CompanyLogo name={job.companyName} size={60} />
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold leading-tight">{job.title}</h2>
            <p className="mt-0.5 text-[13px] text-[#3f3e55]">{job.companyName}</p>
            <div className="mt-0.5 flex flex-wrap gap-x-8 text-[13px] text-[#3f3e55]">
              <span>{locationText(job)}</span>
              {salary ? <span className="font-medium text-foreground">{salary}</span> : null}
            </div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-[76px] text-[12px] text-muted-foreground">
          {job.yoeMin != null ? <span>{job.yoeMin}+ yrs</span> : null}
          {job.yoeMin != null ? <span>·</span> : null}
          <span>{JOB_TYPE_LABEL[job.jobType]}</span>
          {job.postedAt ? <span>· posted {timeAgo(job.postedAt)}</span> : null}
          {job.isNew ? <Tag tone="green">New</Tag> : null}
        </div>
        <a href={link} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-[#2f2496] underline underline-offset-2">
          Original job link <ExternalLink className="size-3.5" />
        </a>
        <div className="mt-3">
          <ApplyControl status={status} onApply={onApply} applicationId={job.applicationId} full />
        </div>
        {loading ? (
          <div className="mt-8 flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading the full job description…
          </div>
        ) : null}
        {s ? (
          <div className="mt-5 space-y-5 text-[12.5px] leading-relaxed text-[#2b2a3d]">
            <Block title="Job description" lines={s.about} paragraph />
            <Block title="Responsibilities" lines={s.responsibilities} />
            <Block title="Qualifications" lines={s.qualifications} />
            <Block title="Benefits" lines={s.benefits} />
            {s.pay.length || salary ? <Block title="Pay" lines={s.pay.length ? s.pay : [salary ?? ""]} /> : null}
            {!s.about.length && !s.responsibilities.length && !s.qualifications.length ? (
              <p className="text-muted-foreground">The career site didn&apos;t return a description. Open the original job link to read it.</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function Block({ title, lines, paragraph }: { title: string; lines: string[]; paragraph?: boolean }) {
  if (!lines.length) return null;
  return (
    <section>
      <h3 className="mb-1.5 text-[14px] font-semibold text-foreground">{title}</h3>
      {paragraph ? (
        <div className="space-y-2">
          {lines.slice(0, 12).map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      ) : (
        <ul className="list-disc space-y-1 pl-5">
          {lines.slice(0, 30).map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
