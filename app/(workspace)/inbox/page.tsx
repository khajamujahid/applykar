import { currentProfile } from "@/lib/current";
import { listInbox } from "@/lib/inbox/store";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const { profile } = await currentProfile();
  const messages = await listInbox(profile.id);

  return (
    <div className="px-4 py-4" data-testid="inbox">
      <h1 className="text-base font-medium">Inbox</h1>
      <p className="mt-1 text-[12px] text-muted-foreground">
        {profile.applicationEmail ?? "Set INBOX_DOMAIN to give this profile an application address."} Codes, confirmations, interviews, and rejections land here and update the tracker.
      </p>
      {messages.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">No application mail yet. Connect Gmail or IMAP in Settings.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {messages.map((message) => (
            <li key={message.id} data-testid="inbox-message" className="grid gap-1 px-3 py-3">
              <p className="font-medium">{message.subject || "(no subject)"}</p>
              <p className="text-[12px] text-muted-foreground">
                {message.sender} · {message.ats} · {message.kind}
                {message.employer ? ` · ${message.employer}` : ""}
              </p>
              {message.verificationCode ? <p>Code {message.verificationCode}</p> : null}
              {message.verifyUrl ? (
                <a className="truncate text-primary" href={message.verifyUrl}>
                  {message.verifyUrl}
                </a>
              ) : null}
              {message.applicationId ? <p className="text-[12px]">Matched to an application and saved as proof.</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
