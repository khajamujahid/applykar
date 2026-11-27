"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brain, Check, CloudUpload, FileText, Loader2, Pencil, Plus } from "lucide-react";
import { newProfileAction, saveAnswerAction, saveProfileDetailsAction, setDefaultProfileAction, uploadResumeAction } from "@/app/actions";

type ProfileCard = { id: string; name: string; resumeFilename: string | null; years: number | null; tags: string[]; isDefault: boolean };
type Selected = { id: string; name: string; titles: string; locations: string; salary: string; years: number | null; resumeFilename: string | null; structured: boolean };
type Personal = { name: string; email: string; phone: string; linkedin: string; location: string; remote: string; jobType: string };

const LABELS: Record<string, string> = {
  work_authorization: "Work authorization",
  sponsorship: "Sponsorship",
  willing_to_relocate: "Relocate",
  availability: "Start date",
  salary_expectation: "Salary",
  employment_type: "Engagement",
  work_location: "Work location",
};

export function ProfilesScreen({ profiles, max, selected, personal, answers }: { profiles: ProfileCard[]; max: number; selected: Selected; personal: Personal; answers: { key: string; question: string; answer: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <div className="scroll-thin h-full overflow-y-auto bg-white">
      <div className="mx-auto max-w-[1180px] px-6 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[24px] font-semibold tracking-tight">
            Profiles <span className="font-normal text-[#3f3e55]">({profiles.length} of {max})</span>
          </h1>
          <button
            type="button"
            disabled={pending || profiles.length >= max}
            onClick={() =>
              start(async () => {
                const r = await newProfileAction();
                if (!r.ok) setNotice(r.error ?? null);
                else router.push(`/profiles?p=${r.id}`);
                router.refresh();
              })
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-medium text-white disabled:opacity-50"
          >
            <Plus className="size-4" /> New profile
          </button>
        </div>
        {notice ? <p className="mt-2 text-[12.5px] text-[#c7303f]">{notice}</p> : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {profiles.map((p) => (
            <Link
              key={p.id}
              href={`/profiles?p=${p.id}`}
              className={`relative rounded-xl border bg-white p-4 transition hover:shadow-sm ${p.id === selected.id ? "border-[#2f2496] ring-1 ring-[#2f2496]" : "border-border"}`}
            >
              <div className="flex gap-3.5">
                <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#f1effd] text-[#4a3bd4]">
                  <Brain className="size-6" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold">{p.name}</p>
                  <p className="truncate text-[12.5px] text-[#3f3e55]">{p.resumeFilename ?? "No resume yet"}</p>
                  <p className="text-[12.5px] text-[#3f3e55]">{p.years ? `${p.years}+ years` : "Experience not set"}</p>
                </div>
              </div>
              {p.isDefault ? (
                <span className="absolute right-3 top-3 rounded-md border border-[#dcd8f3] bg-[#f6f4ff] px-2 py-0.5 text-[11.5px] font-medium text-[#3d30b8]">Default</span>
              ) : (
                <button
                  type="button"
                  onClick={(e) => (e.preventDefault(), start(async () => (await setDefaultProfileAction(p.id), router.refresh())))}
                  className="absolute right-3 top-3 rounded-md px-2 py-0.5 text-[11.5px] text-muted-foreground hover:bg-muted"
                >
                  Make default
                </button>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(p.tags.length ? p.tags : ["Add target titles"]).map((t) => (
                  <span key={t} className="rounded-md bg-[#f1effd] px-2 py-0.5 text-[11.5px] text-[#3d30b8]">
                    {t}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>

        <form
          ref={formRef}
          action={(fd) => start(async () => (await saveProfileDetailsAction(selected.id, fd), setNotice("Saved"), router.refresh()))}
          className="mt-5 space-y-5 rounded-xl border border-border p-5"
        >
          <Section title="Personal info">
            <div className="grid gap-3 md:grid-cols-3">
              <Inline label="Name" name="name" defaultValue={personal.name} />
              <Inline label="Email" name="email" defaultValue={personal.email} />
              <Inline label="Phone" name="phone" defaultValue={personal.phone} />
              <Inline label="LinkedIn" name="linkedin" defaultValue={personal.linkedin} />
              <Inline label="Location" name="location" defaultValue={personal.location} />
              <Inline label="Profile name" name="profileName" defaultValue={selected.name} />
            </div>
          </Section>
          <Section title="Resume upload">
            <ResumeDrop profileId={selected.id} filename={selected.resumeFilename} structured={selected.structured} />
          </Section>
          <Section title="Job preferences">
            <div className="grid gap-3 md:grid-cols-3">
              <Inline label="Titles" name="titles" defaultValue={selected.titles} />
              <Inline label="Locations" name="locations" defaultValue={selected.locations} />
              <Inline label="Remote" name="remote" defaultValue={personal.remote} />
              <Inline label="Salary range" name="salary" defaultValue={selected.salary} />
              <Inline label="Job type" name="jobType" defaultValue={personal.jobType} />
              <Inline label="Years" name="years" defaultValue={selected.years ? String(selected.years) : ""} />
            </div>
          </Section>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-white disabled:opacity-60">
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} Save profile
            </button>
            {notice === "Saved" ? <span className="inline-flex items-center gap-1 text-[12.5px] text-[#1f7a45]"><Check className="size-3.5" /> Saved</span> : null}
          </div>
        </form>

        <div className="mt-5 rounded-xl border border-border p-5">
          <Section title="Saved answers">
            <div className="grid gap-3 md:grid-cols-3">
              {answers.map((a) => (
                <SavedAnswer key={a.key} item={a} label={LABELS[a.key] ?? a.question} />
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 text-[14.5px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Inline({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-lg border border-input bg-white px-3 text-[13px] focus-within:border-primary">
      <span className="shrink-0 text-[#3f3e55]">{label}:</span>
      <input name={name} defaultValue={defaultValue} className="min-w-0 flex-1 bg-transparent outline-none" />
    </label>
  );
}

function SavedAnswer({ item, label }: { item: { key: string; question: string; answer: string }; label: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.answer);
  const [pending, start] = useTransition();
  return (
    <div className="flex min-h-10 items-center gap-2 rounded-lg border border-input bg-white px-3 py-1.5 text-[13px]" title={item.question}>
      <span className="shrink-0 text-[#3f3e55]">{label}:</span>
      {editing ? (
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), start(async () => (await saveAnswerAction(item.key, item.question, value), setEditing(false))))} />
      ) : (
        <span className="min-w-0 flex-1 truncate">{value}</span>
      )}
      <button
        type="button"
        aria-label={editing ? "Save answer" : "Edit answer"}
        onClick={() => (editing ? start(async () => (await saveAnswerAction(item.key, item.question, value), setEditing(false))) : setEditing(true))}
        className="shrink-0 rounded p-1 text-[#3f3e55] hover:bg-muted"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : editing ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
      </button>
    </div>
  );
}

function ResumeDrop({ profileId, filename, structured }: { profileId: string; filename: string | null; structured: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [state, setState] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const upload = (file: File) =>
    start(async () => {
      const fd = new FormData();
      fd.set("resume", file);
      const r = await uploadResumeAction(profileId, fd);
      setState(r.ok ? `Uploaded ${file.name}` : (r.error ?? "Upload failed"));
      router.refresh();
    });
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files[0];
          if (file) upload(file);
        }}
        className={`flex h-14 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed text-[13px] font-medium text-[#2f2496] ${over ? "border-primary bg-[#f4f2fe]" : "border-[#bdb4f4] bg-[#faf9ff]"}`}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-5" />} Drop files here or click to upload
      </div>
      <input ref={input} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <FileText className="size-3.5" />
        {state ?? (filename ? `Current: ${filename}` : "No resume uploaded")}
        {structured ? " · Structured resume on file (used for tailoring)" : ""}
      </p>
    </div>
  );
}
