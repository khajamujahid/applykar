import { extensionTokenIsValid, bearerToken } from "@/lib/extension/auth";
import { listApplications } from "@/lib/services/applications";
import { ensureOwner, getAnswers, listProfiles, setActiveProfile } from "@/lib/services/profiles";

export const extensionCors: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

export function extensionJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: extensionCors });
}

export async function extensionProfile(request: Request) {
  const ok = await extensionTokenIsValid(bearerToken(request));
  if (!ok) return null;
  return ensureOwner();
}

export async function extensionSnapshot() {
  const profile = await ensureOwner();
  const profiles = await listProfiles(profile.email);
  const applications = await listApplications(profile.id);
  const answers = await getAnswers(profile.id);
  return {
    profile: { id: profile.id, name: profile.name, email: profile.email },
    profiles: profiles.map((item) => ({ id: item.id, name: item.name, active: item.id === profile.id })),
    applications: applications.slice(0, 6).map((item) => ({
      id: item.id,
      title: item.title,
      company: item.companyName,
      status: item.status,
    })),
    answers: answers.map((answer) => ({ key: answer.key, question: answer.question, answer: answer.answer })),
  };
}

export async function switchExtensionProfile(profileId: string) {
  const current = await ensureOwner();
  await setActiveProfile(profileId, current.email);
  return extensionSnapshot();
}
