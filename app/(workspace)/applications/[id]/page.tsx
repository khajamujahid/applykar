import { notFound } from "next/navigation";
import { ApplicationScreen } from "@/components/app/application-screen";
import { currentProfile } from "@/lib/current";
import { fullDescription, latestTailored } from "@/lib/apply/pipeline";
import { splitSections } from "@/lib/jobs/details";
import { renderResumeHtml } from "@/lib/resume/render";
import type { ResumeData, TailoringChange } from "@/lib/resume/types";
import { getApplied } from "@/lib/services/applied";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function ApplicationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const { profile } = await currentProfile();
  const app = await getApplied(profile.id, id);
  if (!app) notFound();
  const [tailored, description] = await Promise.all([latestTailored(id), fullDescription(app.jobId).catch(() => "")]);
  const resumeHtml = tailored ? renderResumeHtml(tailored.data as ResumeData, { highlight: tailored.keywords, screen: true }) : null;
  return (
    <ApplicationScreen
      app={app}
      tab={tab ?? "resume"}
      resume={
        tailored
          ? {
              html: resumeHtml!,
              changes: (tailored.changes ?? []) as TailoringChange[],
              keywords: tailored.keywords,
              matchScore: tailored.matchScore ?? 0,
              engine: tailored.engine,
              createdAt: tailored.createdAt.toISOString(),
            }
          : null
      }
      sections={splitSections(description)}
    />
  );
}
