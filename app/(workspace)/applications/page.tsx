import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { AppliedRowLink } from "@/components/app/applied-row";
import { CompanyLogo, StatusPill, timeAgo } from "@/components/app/bits";
import { currentProfile } from "@/lib/current";
import type { ApplicationStatus } from "@/lib/domain";
import { listApplied } from "@/lib/services/applied";

export const dynamic = "force-dynamic";

const TABS: { key: string; label: string; statuses?: ApplicationStatus[] }[] = [
  { key: "all", label: "All" },
  { key: "applied", label: "Applied", statuses: ["applied", "interview"] },
  { key: "applying", label: "Applying", statuses: ["queued", "applying", "ready_for_review"] },
  { key: "needs_info", label: "Needs info", statuses: ["needs_info"] },
  { key: "failed", label: "Failed", statuses: ["failed"] },
];

export default async function AppliedPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "all" } = await searchParams;
  const { profile } = await currentProfile();
  const rows = await listApplied(profile.id);
  const count = (s: ApplicationStatus[]) => rows.filter((r) => s.includes(r.status)).length;
  const stats = [
    { label: "Applied", value: count(["applied", "interview"]) },
    { label: "Applying", value: count(["queued", "applying", "ready_for_review"]) },
    { label: "Needs info", value: count(["needs_info"]) },
    { label: "Interviews", value: count(["interview"]) },
  ];
  const tab = TABS.find((t) => t.key === status) ?? TABS[0];
  const visible = tab.statuses ? rows.filter((r) => tab.statuses!.includes(r.status)) : rows.filter((r) => r.status !== "withdrawn");
  return (
    <div className="scroll-thin h-full overflow-y-auto bg-white">
      <div className="mx-auto max-w-[1180px] px-6 py-6">
        <h1 className="text-[24px] font-semibold tracking-tight">Applications</h1>
        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-white px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <p className="text-[13px] text-[#3f3e55]">{s.label}</p>
              <p className="mt-1 text-[28px] font-semibold leading-none">{s.value}</p>
            </div>
          ))}
        </div>
        <nav className="mt-6 flex gap-1 border-b border-border">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === "all" ? "/applications" : `/applications?status=${t.key}`}
              className={`-mb-px border-b-2 px-3 py-2 text-[13.5px] ${t.key === tab.key ? "border-primary font-medium text-[#2f2496]" : "border-transparent text-[#3f3e55] hover:text-foreground"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-[13px]">
            <thead className="bg-[#fbfbfd] text-left text-[12.5px] text-[#3f3e55]">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-medium">Company &amp; Job</th>
                <th className="px-4 py-2.5 font-medium">Date Applied</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium" colSpan={2}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    Nothing here yet. Press Apply on any job and it shows up here with its status.
                  </td>
                </tr>
              ) : null}
              {visible.map((r) => (
                <AppliedRowLink key={r.id} href={`/applications/${r.id}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <CompanyLogo name={r.companyName} size={40} />
                      <div className="min-w-0">
                        <p className="truncate text-[14.5px] font-semibold">{r.title}</p>
                        <p className="truncate text-[12.5px] text-[#3f3e55]">{r.companyName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[#2b2a3d]">{timeAgo(r.appliedAt ?? r.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="inline-flex items-center gap-3">
                      <StatusPill status={r.status} />
                      {r.status === "needs_info" && r.missing.length ? (
                        <Link href={`/applications/${r.id}?tab=details`} className="text-[12.5px] font-medium text-[#2f2496] hover:underline">
                          Answer {r.missing.length} question{r.missing.length > 1 ? "s" : ""}
                        </Link>
                      ) : null}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {r.hasProof ? (
                      <Link href={`/applications/${r.id}?tab=details`} className="text-[12.5px] font-medium text-[#2f2496] hover:underline">
                        View proof
                      </Link>
                    ) : (
                      <span className="text-[12.5px] text-muted-foreground">No proof yet</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <a href={r.sourceUrl || r.applyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#2f2496] hover:underline">
                      <ExternalLink className="size-3.5" /> Original job link
                    </a>
                  </td>
                </AppliedRowLink>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
