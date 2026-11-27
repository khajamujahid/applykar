import type { ApplicationStatus } from "@/lib/domain";

const PALETTE = ["#2f6fd6", "#16a394", "#7c4ddb", "#e0812a", "#d94c6a", "#2b9a5a", "#4a3bd4", "#0f8db3", "#b5532f", "#5a6475"];

export function CompanyLogo({ name, size = 44 }: { name: string; size?: number }) {
  const clean = name.replace(/[^A-Za-z0-9 ]/g, "").trim() || "?";
  const hash = [...clean].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const color = PALETTE[hash % PALETTE.length];
  const initials = clean
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div
      className="grid shrink-0 place-items-center rounded-xl font-semibold text-white"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${color}, ${color}cc)`, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

export function MatchRing({ score, size = 62 }: { score: number; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#ebe9f6" strokeWidth={5} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#4a3bd4" strokeWidth={5} fill="none" strokeLinecap="round" strokeDasharray={`${(c * pct) / 100} ${c}`} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <div>
          <div className="text-[14px] font-semibold">{pct}%</div>
          <div className="mt-0.5 text-[9.5px] text-muted-foreground">Match</div>
        </div>
      </div>
    </div>
  );
}

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  queued: "Queued",
  applying: "Applying…",
  ready_for_review: "Ready to submit",
  needs_info: "Needs info",
  applied: "Applied",
  interview: "Interview",
  rejected: "Rejected",
  failed: "Failed",
  withdrawn: "Withdrawn",
};

const STATUS_STYLE: Record<ApplicationStatus, string> = {
  queued: "bg-[#eef0f6] text-[#4b5068]",
  applying: "bg-[#2f6fd6] text-white",
  ready_for_review: "bg-[#efeafe] text-[#4a3bd4]",
  needs_info: "bg-[#d89614] text-white",
  applied: "bg-[#27a35a] text-white",
  interview: "bg-[#4a3bd4] text-white",
  rejected: "bg-[#eef0f6] text-[#6b6a80]",
  failed: "bg-[#dc3d4b] text-white",
  withdrawn: "bg-[#eef0f6] text-[#6b6a80]",
};

export function StatusPill({ status, soft = false }: { status: ApplicationStatus; soft?: boolean }) {
  if (soft && status === "applied")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-[#e8f6ee] px-2 py-0.5 text-[12px] font-medium text-[#1f7a45]">
        <span className="size-1.5 rounded-full bg-[#27a35a]" />
        Applied
      </span>
    );
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    return `${h} hour${h > 1 ? "s" : ""} ago`;
  }
  const d = Math.floor(s / 86400);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  const w = Math.floor(d / 7);
  return w === 1 ? "1 week ago" : `${w} weeks ago`;
}

export function Tag({ children, tone = "violet" }: { children: React.ReactNode; tone?: "violet" | "green" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-[2px] text-[11.5px] font-medium ${
        tone === "green" ? "bg-[#e8f6ee] text-[#1f7a45]" : "bg-[#f1effd] text-[#3d30b8]"
      }`}
    >
      {tone === "green" ? <span className="size-1.5 rounded-full bg-[#27a35a]" /> : null}
      {children}
    </span>
  );
}
