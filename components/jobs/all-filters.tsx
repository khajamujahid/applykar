"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { JobFilters, JobSource } from "@/lib/domain";

const SOURCES: JobSource[] = ["greenhouse", "lever", "ashby", "workday", "icims", "smartrecruiters", "workable", "bamboohr", "jazzhr", "breezy", "rippling", "recruitee"];

export function AllFilters({ open, onOpenChange, filters, onApply }: { open: boolean; onOpenChange: (open: boolean) => void; filters: JobFilters; onApply: (next: JobFilters) => void }) {
  const [draft, setDraft] = useState<JobFilters>(filters);
  const set = (patch: Partial<JobFilters>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[400px]">
        <div className="border-b border-border px-5 py-4">
          <SheetTitle className="text-[16px] font-semibold">All filters</SheetTitle>
        </div>
        <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 text-[13px]">
          <Field label="Minimum salary (yearly)">
            <input type="number" step={5000} value={draft.salaryFloor ?? ""} onChange={(e) => set({ salaryFloor: Number(e.target.value) || undefined })} placeholder="e.g. 120000" className="input" />
          </Field>
          <Field label="Title must include">
            <input value={draft.title ?? ""} onChange={(e) => set({ title: e.target.value || undefined })} placeholder="e.g. Python" className="input" />
          </Field>
          <Field label="Keywords to include">
            <input value={draft.includeText ?? ""} onChange={(e) => set({ includeText: e.target.value || undefined })} placeholder="e.g. FastAPI" className="input" />
          </Field>
          <Field label="Keywords to exclude">
            <input value={draft.excludeText ?? ""} onChange={(e) => set({ excludeText: e.target.value || undefined })} placeholder="e.g. clearance" className="input" />
          </Field>
          <Field label="Hide companies (comma separated)">
            <input value={draft.excludeCompanies ?? ""} onChange={(e) => set({ excludeCompanies: e.target.value || undefined })} className="input" />
          </Field>
          <div className="space-y-3">
            <Toggle label="Only jobs with salary" checked={Boolean(draft.hasSalary)} onChange={(v) => set({ hasSalary: v || undefined })} />
            <Toggle label="C2C-friendly only" checked={Boolean(draft.c2cOnly)} onChange={(v) => set({ c2cOnly: v || undefined })} />
            <Toggle label="Include W2-only roles" checked={Boolean(draft.includeW2Only)} onChange={(v) => set({ includeW2Only: v || undefined })} />
            <Toggle label="Include director / VP roles" checked={Boolean(draft.includeLeadership)} onChange={(v) => set({ includeLeadership: v || undefined })} />
            <Toggle label="Hide staffing agencies" checked={draft.excludeStaffing !== false} onChange={(v) => set({ excludeStaffing: v ? undefined : false })} />
            <Toggle label="Hide jobs that won't sponsor" checked={draft.sponsorship === "no"} onChange={(v) => set({ sponsorship: v ? "no" : undefined })} />
          </div>
          <Field label="Career sites">
            <div className="flex flex-wrap gap-1.5">
              {SOURCES.map((source) => {
                const on = draft.sources?.includes(source) ?? false;
                return (
                  <button
                    key={source}
                    type="button"
                    onClick={() => {
                      const next = on ? (draft.sources ?? []).filter((s) => s !== source) : [...(draft.sources ?? []), source];
                      set({ sources: next.length ? next : undefined });
                    }}
                    className={`rounded-md border px-2 py-1 text-[12px] capitalize ${on ? "border-primary bg-[#f4f2fe] text-primary" : "border-input"}`}
                  >
                    {source}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
        <div className="flex gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={() => onApply({ tab: filters.tab })} className="h-9 flex-1 rounded-lg border border-input text-[13px] hover:bg-muted">
            Clear all
          </button>
          <button type="button" onClick={() => onApply(draft)} className="h-9 flex-1 rounded-lg bg-primary text-[13px] font-medium text-white">
            Show results
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-medium text-[#3f3e55]">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
