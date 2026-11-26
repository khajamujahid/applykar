import { createProfileAction, saveProfileAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { currentProfile } from "@/lib/current";
import { maxProfiles } from "@/lib/profile/defaults";
import { getAnswers, listProfiles } from "@/lib/services/profiles";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const { email, profile } = await currentProfile();
  const profiles = await listProfiles(email);
  const answers = await getAnswers(profile.id);

  return (
    <div className="grid gap-6 px-4 py-4 xl:grid-cols-[220px_minmax(0,1fr)]">
      <aside>
        <h1 className="text-base font-medium">Profiles</h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {profiles.length} of {maxProfiles()}
        </p>
        <ul className="mt-3 grid gap-1">
          {profiles.map((item) => (
            <li key={item.id} className={item.id === profile.id ? "text-primary" : "text-muted-foreground"}>
              {item.name}
            </li>
          ))}
        </ul>
        {profiles.length < maxProfiles() ? (
          <form
            className="mt-4 grid gap-2"
            action={async (formData) => {
              "use server";
              await createProfileAction(String(formData.get("name") ?? ""));
            }}
          >
            <Input name="name" placeholder="New profile" />
            <Button type="submit" size="sm" variant="outline">
              Add profile
            </Button>
          </form>
        ) : (
          <p className="mt-3 text-[12px] text-muted-foreground">Profile limit reached.</p>
        )}
      </aside>
      <form action={saveProfileAction} className="grid gap-3">
        <h2 className="text-sm font-medium">Edit {profile.name}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" name="name" defaultValue={profile.name} />
          <Field label="Headline" name="headline" defaultValue={profile.headline} />
          <Field label="Target titles" name="titles" defaultValue={profile.targetTitles.join(", ")} />
          <Field label="Skills" name="skills" defaultValue={profile.skills.join(", ")} />
          <Field label="Locations" name="locations" defaultValue={profile.locations.join(", ")} />
          <Field label="Interests" name="interests" defaultValue={profile.interests.join(", ")} />
          <Field label="Years of experience" name="years" defaultValue={profile.yearsExperience ? String(profile.yearsExperience) : ""} />
          <Field label="Hide roles asking for more than" name="yoeMax" defaultValue={profile.yoeMax ? String(profile.yoeMax) : ""} />
          <Field label="Salary min" name="salaryMin" defaultValue={String(profile.salaryMin)} />
          <Field label="Salary max" name="salaryMax" defaultValue={String(profile.salaryMax)} />
          <Field label="C2C hourly minimum" name="c2c" defaultValue={String(profile.c2cMinHourly)} />
        </div>
        <label className="text-[13px]">
          Replace resume
          <Input className="mt-1" name="resume" type="file" accept=".pdf,.docx,.txt,.md" />
        </label>
        <div className="flex flex-wrap gap-3 text-[13px]">
          <Check name="skipW2" label="Skip W-2 only" defaultChecked={profile.skipW2Only} />
          <Check name="prefersC2c" label="Prefer C2C" defaultChecked={profile.prefersC2c} />
          <Check name="usaOnly" label="United States only" defaultChecked={profile.usaOnly} />
          <Check name="leadership" label="Include leadership" defaultChecked={profile.includeLeadership} />
          <Check name="relocate" label="Open to relocate" defaultChecked={profile.openToRelocate} />
        </div>
        <div className="grid gap-2">
          {answers.map((answer) => (
            <label key={answer.key} className="grid gap-1 text-[12px] text-muted-foreground">
              {answer.question}
              <Textarea name={`answer:${answer.key}`} defaultValue={answer.answer} />
            </label>
          ))}
        </div>
        <Button type="submit" className="w-fit">
          Save profile
        </Button>
      </form>
    </div>
  );
}

function Field({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  return (
    <label className="grid gap-1 text-[12px] text-muted-foreground">
      {label}
      <Input name={name} defaultValue={defaultValue} />
    </label>
  );
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}
