import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { currentProfile } from "@/lib/current";
import { listProfiles } from "@/lib/services/profiles";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { email, name, profile } = await currentProfile();
  if (!profile.onboardingComplete) redirect("/onboarding");
  const profiles = await listProfiles(email);
  return (
    <Shell email={email || name} profileName={profile.name} profiles={profiles.map((item) => ({ id: item.id, name: item.name }))}>
      {children}
    </Shell>
  );
}
