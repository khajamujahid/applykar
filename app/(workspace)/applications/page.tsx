import Link from "next/link";
import { markAppliedAction, setStatusAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currentProfile } from "@/lib/current";
import type { ApplicationStatus } from "@/lib/domain";
import { listApplications } from "@/lib/services/applications";

const statuses: ApplicationStatus[] = ["queued", "ready_for_review", "applied", "interview", "rejected"];

export const dynamic = "force-dynamic";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = typeof params.status === "string" && statuses.includes(params.status as ApplicationStatus) ? (params.status as ApplicationStatus) : undefined;
  const { profile } = await currentProfile();
  const items = await listApplications(profile.id, status);

  return (
    <div className="px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-medium">Tracker</h1>
          <p className="text-[12px] text-muted-foreground">{profile.name}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Link href="/applications" className={`rounded-full border px-2 py-1 ${status ? "border-border text-muted-foreground" : "border-primary text-primary"}`}>
            All
          </Link>
          {statuses.map((item) => (
            <Link
              key={item}
              href={`/applications?status=${item}`}
              className={`rounded-full border px-2 py-1 capitalize ${status === item ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
            >
              {item.replaceAll("_", " ")}
            </Link>
          ))}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">Nothing in this queue yet. Queue a role from the feed.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {items.map((item) => (
            <li key={item.id} data-testid="application-row" className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <Link href={`/applications/${item.id}`} className="font-medium hover:text-primary">
                  {item.title}
                </Link>
                <p className="text-muted-foreground">
                  {item.companyName} · <span className="capitalize">{item.status.replaceAll("_", " ")}</span>
                </p>
                {item.proofNote ? <p className="mt-1 text-[12px] text-muted-foreground">Proof: {item.proofNote}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">{item.score}</Badge>
                {item.status !== "applied" ? (
                  <form action={markAppliedAction.bind(null, item.id)} className="flex flex-wrap gap-1">
                    <Input name="proofNote" placeholder="Confirmation email or note" className="h-7 w-44" data-testid="proof-note" />
                    <Input name="proofUrl" placeholder="Proof URL" className="h-7 w-32" />
                    <Button size="sm" type="submit" data-testid="mark-applied">
                      Mark applied
                    </Button>
                  </form>
                ) : (
                  <Badge>Applied</Badge>
                )}
                {item.status === "applied" ? (
                  <form action={setStatusAction.bind(null, item.id, "interview")}>
                    <Button size="sm" variant="outline" type="submit">
                      Interview
                    </Button>
                  </form>
                ) : null}
                <form action={setStatusAction.bind(null, item.id, "rejected")}>
                  <Button size="sm" variant="ghost" type="submit">
                    Rejected
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
