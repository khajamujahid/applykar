import Link from "next/link";
import { notFound } from "next/navigation";
import { markAppliedAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { currentProfile } from "@/lib/current";
import { getAnswers } from "@/lib/services/profiles";
import { getApplication } from "@/lib/services/applications";
import { CopyPacket } from "@/components/copy-packet";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await currentProfile();
  const application = await getApplication(profile.id, id);
  if (!application) notFound();
  const answers = await getAnswers(profile.id);
  const terms = application.job.skillTags.filter((tag) => tag.length > 2).slice(0, 12);

  return (
    <div className="grid gap-4 px-4 py-4 xl:grid-cols-2">
      <section className="rounded-lg border border-border p-4">
        <p className="text-[12px] text-muted-foreground">Resume · titles, employers, and dates stay locked</p>
        <h1 className="mt-1 text-base font-medium">
          {application.title} at {application.companyName}
        </h1>
        {profile.resumeText ? (
          <p className="mt-4 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
            <Highlighted text={profile.resumeText.slice(0, 4000)} terms={terms} />
          </p>
        ) : (
          <p className="mt-4 text-muted-foreground">
            This profile has no resume yet. <Link className="text-primary" href="/profiles">Upload one</Link>.
          </p>
        )}
      </section>
      <section className="rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium">Saved answers</h2>
        <ul className="mt-3 divide-y divide-border">
          {answers.map((answer) => (
            <li key={answer.key} className="py-2">
              <p className="text-[12px] text-muted-foreground">{answer.question}</p>
              <p>{answer.answer}</p>
            </li>
          ))}
        </ul>
        <h2 className="mt-4 text-sm font-medium">Note for this role</h2>
        <Textarea readOnly value={application.whyThisRole} className="mt-2 min-h-28" />
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyPacket text={application.answerPacket} />
          <Button variant="outline" nativeButton={false} render={<a href={application.applyUrl} target="_blank" rel="noreferrer" />}>
            Open apply link
          </Button>
          <Badge variant="outline" className="capitalize">
            {application.status.replaceAll("_", " ")}
          </Badge>
        </div>
        {application.status !== "applied" ? (
          <form action={markAppliedAction.bind(null, application.id)} className="mt-4 grid gap-2">
            <Textarea name="proofNote" placeholder="Paste the confirmation email or submission id" data-testid="review-proof" />
            <Button type="submit">Mark applied</Button>
          </form>
        ) : null}
      </section>
    </div>
  );
}

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return text;
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "ig");
  const parts = text.split(pattern);
  return parts.map((part, index) =>
    terms.some((term) => term.toLowerCase() === part.toLowerCase()) ? (
      <mark key={`${part}-${index}`} className="rounded bg-primary/20 px-0.5 text-foreground">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
