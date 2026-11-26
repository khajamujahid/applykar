import { redirect } from "next/navigation";
import { completeOnboardingAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currentProfile } from "@/lib/current";
import { INTEREST_OPTIONS, LOCATION_OPTIONS } from "@/lib/profile/defaults";
import { parseResume } from "@/lib/profile/parse-resume";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { profile } = await currentProfile();
  if (profile.onboardingComplete) redirect("/feed");
  const parsed = parseResume(profile.resumeText);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-[12px] uppercase tracking-[0.16em] text-primary">Onboarding</p>
      <h1 className="mt-2 text-2xl font-medium tracking-tight">Set up {profile.name}</h1>
      <p className="mt-2 text-[13px] text-muted-foreground">
        Upload a resume. Applykar reads skills, titles, and years, then you pick what this profile should chase.
      </p>
      <form action={completeOnboardingAction} className="mt-6 grid gap-5">
        <label className="grid gap-1 text-[13px]">
          Profile name
          <Input name="name" defaultValue={profile.name} required />
        </label>
        <label className="grid gap-1 text-[13px]">
          Resume (PDF, DOCX, TXT, or Markdown)
          <Input name="resume" type="file" accept=".pdf,.docx,.txt,.md" />
        </label>
        <label className="grid gap-1 text-[13px]">
          Skills, comma separated
          <Input name="skills" defaultValue={(parsed.skills.length ? parsed.skills : profile.skills).join(", ")} placeholder="sql, python, dbt" />
        </label>
        <label className="grid gap-1 text-[13px]">
          Target titles, comma separated
          <Input name="titles" defaultValue={(parsed.targetTitles.length ? parsed.targetTitles : profile.targetTitles).join(", ")} placeholder="Analytics engineer" />
        </label>
        <fieldset>
          <legend className="text-[13px]">Interests</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((interest) => (
              <label key={interest} className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[13px]">
                <input type="checkbox" name="interests" value={interest} defaultChecked={profile.interests.includes(interest)} />
                {interest}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-[13px]">Locations</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {LOCATION_OPTIONS.map((location) => (
              <label key={location} className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[13px]">
                <input type="checkbox" name="locations" value={location} defaultChecked={profile.locations.includes(location)} />
                {location}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit">See the feed</Button>
      </form>
    </main>
  );
}
