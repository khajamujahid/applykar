"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Download, ExternalLink, Loader2, Pencil, PieChart, Plus, X } from "lucide-react";
import { answerAndRetryAction, markInterviewAction, tailorNowAction, withdrawAction } from "@/app/actions";
import { CompanyLogo, StatusPill } from "@/components/app/bits";
import type { ApplicationStatus } from "@/lib/domain";
import type { TailoringChange } from "@/lib/resume/types";
import { clockTime, dateTime, dayKey, shortDate } from "@/lib/time";

const FIT = `<style>html{background:#f6f6f9}body{margin:8px 0!important}</style><script>(function(){function f(){var w=document.documentElement.clientWidth;document.body.style.zoom=String(Math.min(1,(w-16)/816))}addEventListener("resize",f);f()})()</script>`;

function fitToFrame(html: string) {
  return html.includes("</body>") ? html.replace("</body>", `${FIT}</body>`) : html + FIT;
}

type App = {
  id: string;
  status: ApplicationStatus;
  title: string;
  companyName: string;
  applyUrl: string;
  sourceUrl: string | null;
  locationRaw: string | null;
  missing: string[];
  hasProof: boolean;
  appliedAt: string | null;
  createdAt: string;
  events: { at: string; kind: string; text: string }[];
  answers: { question: string; answer: string }[];
  proofNote: string | null;
};

type Sections = { about: string[]; responsibilities: string[]; qualifications: string[]; benefits: string[]; pay: string[] };

const TABS = [
  { key: "resume", label: "Tailored resume" },
  { key: "jd", label: "Job description" },
  { key: "details", label: "Application details" },
  { key: "link", label: "Job link" },
];

function when(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const time = clockTime(d);
  if (days === 0 && dayKey(new Date()) === dayKey(d)) return `today ${time}`;
  if (days <= 1) return `yesterday ${time}`;
  return `${shortDate(d)} ${time}`;
}

export function ApplicationScreen({
  app,
  tab: initialTab,
  resume,
  sections,
}: {
  app: App;
  tab: string;
  resume: { html: string; changes: TailoringChange[]; keywords: string[]; matchScore: number; engine: string; createdAt: string } | null;
  hasStructuredResume?: boolean;
  sections: Sections;
}) {
  const router = useRouter();
  const [tab, setTab] = useState(TABS.some((t) => t.key === initialTab) ? initialTab : "resume");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const link = app.sourceUrl || app.applyUrl;
  const stamp = app.appliedAt ? `Applied ${when(app.appliedAt)}` : `Queued ${when(app.createdAt)}`;
  return (
    <div className="scroll-thin h-full overflow-y-auto bg-white">
      <div className="mx-auto max-w-[1180px] px-6 py-4">
        <Link href="/applications" className="inline-flex items-center gap-2 text-[13.5px] font-medium text-[#2f2496] hover:underline">
          <ArrowLeft className="size-4" /> Back to Applications
        </Link>
        <div className="mt-4 flex flex-wrap items-start gap-4">
          <CompanyLogo name={app.companyName} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">
              {app.title} · {app.companyName}
            </h1>
            <div className="mt-2">
              <StatusPill status={app.status} soft />
            </div>
            <p className="mt-1.5 text-[13px] text-[#3f3e55]">{stamp}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 pt-6">
            <a href={link} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-input px-3.5 text-[13px] font-medium text-[#2f2496] hover:bg-muted">
              <ExternalLink className="size-4" /> Open original job link
            </a>
            <button
              type="button"
              disabled={pending || app.status === "interview"}
              onClick={() => start(async () => (await markInterviewAction(app.id), router.refresh()))}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2f2496] px-3.5 text-[13px] font-medium text-white disabled:opacity-60"
            >
              <CalendarDays className="size-4" /> {app.status === "interview" ? "Interview" : "Mark as interview"}
            </button>
            <button
              type="button"
              disabled={pending || app.status === "withdrawn"}
              onClick={() => start(async () => (await withdrawAction(app.id), router.refresh()))}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#f0b8bd] px-3.5 text-[13px] font-medium text-[#c7303f] hover:bg-[#fff5f6] disabled:opacity-60"
            >
              <X className="size-4" /> {app.status === "withdrawn" ? "Withdrawn" : "Withdraw"}
            </button>
          </div>
        </div>
        <nav className="mt-5 flex gap-1 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => (setTab(t.key), window.history.replaceState(null, "", `?tab=${t.key}`))}
              className={`-mb-px border-b-2 px-3.5 py-2 text-[13.5px] ${t.key === tab ? "border-primary font-medium text-[#2f2496]" : "border-transparent text-[#3f3e55] hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "resume" ? (
          resume ? (
            <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_350px]">
              <div className="rounded-xl border border-border p-3">
                <iframe title="Tailored resume" srcDoc={fitToFrame(resume.html)} className="h-[720px] w-full rounded-lg bg-[#f6f6f9]" />
                <div className="mt-3 flex items-center gap-3">
                  <a href={`/api/applications/${app.id}/resume?download=1`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-input px-3.5 text-[13px] font-medium text-[#2f2496] hover:bg-muted">
                    <Download className="size-4" /> Download PDF
                  </a>
                  <a href={`/api/applications/${app.id}/resume`} target="_blank" rel="noreferrer" className="text-[12.5px] text-muted-foreground hover:underline">
                    Open the exact PDF that was uploaded
                  </a>
                </div>
              </div>
              <aside className="h-fit rounded-xl border border-border p-5">
                <h2 className="text-[16px] font-semibold">Tailoring changes</h2>
                <ul className="mt-3 divide-y divide-border">
                  {resume.changes.map((c, i) => (
                    <li key={i} className="flex gap-3.5 py-4">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#2f2496] text-white">
                        {c.kind === "score" ? <PieChart className="size-5" /> : c.kind === "keywords" ? <Plus className="size-5" /> : <Pencil className="size-[18px]" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold">
                          {c.kind === "score" ? (
                            <>
                              Match score <span className="text-primary">{resume.matchScore}%</span>
                            </>
                          ) : (
                            c.title
                          )}
                        </p>
                        <p className="mt-0.5 text-[12.5px] text-[#3f3e55]">{c.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Engine: {resume.engine.startsWith("ai-gateway") ? "AI Gateway" : "Applykar rules (truthful reorder + emphasis)"} · Only facts already in your resume are used.
                </p>
              </aside>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-border p-10 text-center">
              <p className="text-[14px] font-medium">No tailored resume yet</p>
              <p className="mt-1 text-[13px] text-muted-foreground">Applykar tailors your resume to this job description when the background apply starts.</p>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await tailorNowAction(app.id);
                    if (!r.ok) setError(r.error ?? "Could not tailor");
                    router.refresh();
                  })
                }
                className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-white disabled:opacity-60"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null} Tailor resume now
              </button>
              {error ? <p className="mt-2 text-[12.5px] text-[#c7303f]">{error}</p> : null}
            </div>
          )
        ) : null}

        {tab === "jd" ? (
          <div className="mt-5 max-w-[820px] space-y-5 text-[13.5px] leading-relaxed text-[#2b2a3d]">
            {(["about", "responsibilities", "qualifications", "benefits", "pay"] as const).map((k) =>
              sections[k].length ? (
                <section key={k}>
                  <h3 className="mb-1.5 text-[15px] font-semibold text-foreground">{k === "about" ? "Job description" : k[0].toUpperCase() + k.slice(1)}</h3>
                  {k === "about" ? (
                    sections[k].map((l, i) => <p key={i} className="mb-2">{l}</p>)
                  ) : (
                    <ul className="list-disc space-y-1 pl-5">
                      {sections[k].map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : null,
            )}
            {!sections.about.length && !sections.responsibilities.length && !sections.qualifications.length ? <p className="text-muted-foreground">The career site didn&apos;t return a description.</p> : null}
          </div>
        ) : null}

        {tab === "details" ? (
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <section className="rounded-xl border border-border p-5">
              <h3 className="text-[15px] font-semibold">Timeline</h3>
              <ol className="mt-3 space-y-3 border-l border-[#e3dffa] pl-4">
                {app.events.length === 0 ? <li className="text-[13px] text-muted-foreground">No events yet.</li> : null}
                {app.events.map((e, i) => (
                  <li key={i} className="relative text-[13px]">
                    <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-primary" />
                    <p>{e.text}</p>
                    <p className="text-[11.5px] text-muted-foreground">{dateTime(e.at)}</p>
                  </li>
                ))}
              </ol>
              {app.status === "needs_info" && app.missing.length ? (
                <form action={answerAndRetryAction.bind(null, app.id)} className="mt-5 space-y-3 rounded-lg bg-[#fff8eb] p-4">
                  <p className="text-[13px] font-semibold">Answer {app.missing.length} question{app.missing.length > 1 ? "s" : ""} to continue</p>
                  {app.missing.map((q) => (
                    <label key={q} className="block space-y-1">
                      <span className="text-[12.5px]">{q}</span>
                      <input name={`q:${q}`} type={/password/i.test(q) ? "password" : "text"} autoComplete="off" className="input" />
                    </label>
                  ))}
                  <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-medium text-white">
                    Save answers &amp; retry
                  </button>
                </form>
              ) : null}
            </section>
            <section className="space-y-5">
              <div className="rounded-xl border border-border p-5">
                <h3 className="text-[15px] font-semibold">Answers submitted</h3>
                {app.answers.length === 0 ? <p className="mt-2 text-[13px] text-muted-foreground">Answers appear after the form is filled.</p> : null}
                <dl className="mt-2 divide-y divide-border text-[13px]">
                  {app.answers.map((a, i) => (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 py-2">
                      <dt className="text-[#3f3e55]">{a.question}</dt>
                      <dd className="font-medium">{a.answer}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="rounded-xl border border-border p-5">
                <h3 className="text-[15px] font-semibold">Proof screenshot</h3>
                {app.hasProof ? (
                  <a href={`/api/applications/${app.id}/proof`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/applications/${app.id}/proof`} alt="Application form proof" className="mt-3 max-h-[520px] w-full rounded-lg border border-border object-contain object-top" />
                  </a>
                ) : (
                  <p className="mt-2 text-[13px] text-muted-foreground">A screenshot of the filled form is saved when the apply runs.</p>
                )}
              </div>
            </section>
          </div>
        ) : null}

        {tab === "link" ? (
          <div className="mt-5 rounded-xl border border-border p-5 text-[13.5px]">
            <p className="text-[#3f3e55]">Original posting</p>
            <a href={link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 break-all font-medium text-[#2f2496] underline">
              {link} <ExternalLink className="size-3.5 shrink-0" />
            </a>
            {app.applyUrl !== link ? (
              <>
                <p className="mt-4 text-[#3f3e55]">Application form</p>
                <a href={app.applyUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 break-all font-medium text-[#2f2496] underline">
                  {app.applyUrl} <ExternalLink className="size-3.5 shrink-0" />
                </a>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
