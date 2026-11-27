import { eq } from "drizzle-orm";
import { ProfilesScreen } from "@/components/app/profiles-screen";
import { currentProfile } from "@/lib/current";
import { getDb } from "@/lib/db/client";
import { profiles as profilesTable } from "@/lib/db/schema";
import { OWNER_NAME, maxProfiles } from "@/lib/profile/defaults";
import type { ResumeData } from "@/lib/resume/types";
import { getAnswers, listProfiles } from "@/lib/services/profiles";

export const dynamic = "force-dynamic";

export default async function ProfilesPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const { email, profile: active } = await currentProfile();
  const all = await listProfiles(email);
  const selected = all.find((x) => x.id === p) ?? active;
  const [answers, extra] = await Promise.all([
    getAnswers(selected.id),
    getDb().select({ resumeData: profilesTable.resumeData }).from(profilesTable).where(eq(profilesTable.id, selected.id)).limit(1),
  ]);
  const info = (extra[0]?.resumeData as ResumeData | null)?.personalInformation;
  const get = (key: string) => answers.find((a) => a.key === key)?.answer ?? "";
  const personal = {
    name: get("full_name") || [info?.firstName, info?.lastName].filter(Boolean).join(" ") || OWNER_NAME,
    email: get("email") || info?.email || email,
    phone: get("phone") || info?.phone || "",
    linkedin: get("linkedin") || (info?.linkedinUrl ?? "").replace(/^https?:\/\/(www\.)?/, ""),
    location: get("location") || [info?.city, info?.state].filter(Boolean).join(", ") || selected.locations.join(", "),
    remote: get("remote") || (selected.locations.some((l) => /remote/i.test(l)) ? "Yes" : "No"),
    jobType: get("job_type") || (selected.prefersC2c ? "Contract (C2C), Full-time" : "Full-time"),
  };
  const saved = answers.filter((a) => !["full_name", "email", "phone", "linkedin", "location", "remote", "job_type"].includes(a.key) && !a.key.startsWith("eeo_"));
  return (
    <ProfilesScreen
      profiles={all.map((x) => ({ id: x.id, name: x.name, resumeFilename: x.resumeFilename, years: x.yearsExperience, tags: x.targetTitles.slice(0, 3), isDefault: x.id === active.id }))}
      max={maxProfiles()}
      selected={{
        id: selected.id,
        name: selected.name,
        titles: selected.targetTitles.join(", "),
        locations: selected.locations.join(", "),
        salary: `$${Math.round(selected.salaryMin / 1000)}k–$${Math.round(selected.salaryMax / 1000)}k`,
        years: selected.yearsExperience,
        resumeFilename: selected.resumeFilename,
        structured: Boolean(info),
      }}
      personal={personal}
      answers={saved}
    />
  );
}
