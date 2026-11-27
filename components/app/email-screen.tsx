"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { connectGmailAction, disconnectMailAction, saveImapAction, syncMailAction } from "@/app/actions";
import { timeAgo } from "@/components/app/bits";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type Conn = { id: string; provider: string; email: string; lastSyncedAt: string | null; codesRead: number; ok: boolean };

function GoogleG() {
  return (
    <span className="grid size-7 place-items-center rounded-full bg-white">
      <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
    </span>
  );
}

export function EmailScreen({ connections, activity, notice, googleReady }: { connections: Conn[]; activity: { id: string; source: string; text: string; at: string }[]; notice: string | null; googleReady: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [imap, setImap] = useState(false);
  return (
    <div className="scroll-thin h-full overflow-y-auto bg-white">
      <div className="mx-auto max-w-[900px] px-6 py-7">
        <h1 className="text-[26px] font-semibold tracking-tight">Job email integration</h1>
        <p className="mt-1.5 text-[14px] text-[#3f3e55]">Connect any inbox so Applykar can read verification codes and links automatically</p>
        {notice ? <p className="mt-3 rounded-lg bg-[#e8f6ee] px-3 py-2 text-[13px] text-[#1f7a45]">{notice}</p> : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <form action={connectGmailAction}>
            <button type="submit" disabled={!googleReady} className="inline-flex h-11 items-center gap-2.5 rounded-lg bg-primary px-5 text-[14.5px] font-medium text-white shadow-sm disabled:opacity-50">
              <GoogleG /> Connect Gmail
            </button>
          </form>
          <button type="button" onClick={() => setImap(true)} className="h-11 rounded-lg border border-[#2f2496] px-5 text-[14.5px] font-medium text-[#2f2496] hover:bg-[#f6f4ff]">
            Connect other email (IMAP)
          </button>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">Any Gmail account works, even one different from your sign-in. Connect as many as you use for job applications.</p>

        <div className="mt-6 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-semibold">Connected inboxes</h2>
            {connections.length ? (
              <button type="button" disabled={pending} onClick={() => start(async () => (await syncMailAction(), router.refresh()))} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#2f2496]">
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Sync now
              </button>
            ) : null}
          </div>
          <div className="mt-3 space-y-2">
            {connections.length === 0 ? <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-[13px] text-muted-foreground">No inbox connected yet.</p> : null}
            {connections.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-4 py-3 text-[13.5px]">
                <span className="font-semibold">{c.email}</span>
                <span className="text-[#3f3e55]">
                  - {c.ok ? "Connected" : "Needs reconnect"} - {c.lastSyncedAt ? `Last synced ${timeAgo(c.lastSyncedAt)}` : "Not synced yet"} - {c.codesRead} codes read
                </span>
                <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[11px] uppercase text-muted-foreground">{c.provider}</span>
                <button type="button" onClick={() => start(async () => (await disconnectMailAction(c.id), router.refresh()))} className="ml-auto h-8 rounded-lg border border-[#2f2496] px-3 text-[13px] font-medium text-[#2f2496] hover:bg-[#f6f4ff]">
                  Disconnect
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-border">
            <h3 className="border-b border-border px-4 py-3 text-[15px] font-semibold">Recent verification activity</h3>
            {activity.length === 0 ? <p className="px-4 py-4 text-[13px] text-muted-foreground">Codes and verify links show up here as applications send them.</p> : null}
            <ul className="divide-y divide-border">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-4 py-3 text-[13.5px]">
                  <span>
                    <span className="font-semibold">{a.source}</span> - {a.text}
                  </span>
                  <span className="text-[12.5px] text-[#3f3e55]">{timeAgo(a.at)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-8 text-[12.5px] text-[#3f3e55]">Read-only access</p>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">Gmail uses the gmail.readonly scope. Applykar only reads job emails (codes, links, confirmations) and never sends or deletes mail.</p>
      </div>
      <Dialog open={imap} onOpenChange={setImap}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Connect other email (IMAP)</DialogTitle>
          <form action={(fd) => start(async () => (await saveImapAction(fd), setImap(false), router.refresh()))} className="grid gap-2.5">
            <input name="host" placeholder="IMAP host (e.g. imap.mail.yahoo.com)" className="input" required />
            <input name="port" defaultValue="993" placeholder="Port" className="input" />
            <input name="user" placeholder="Email / username" className="input" required />
            <input name="password" type="password" placeholder="App password" className="input" required />
            <label className="flex items-center gap-2 text-[12.5px]">
              <input type="checkbox" name="tls" defaultChecked /> Use TLS
            </label>
            <button type="submit" className="h-9 rounded-lg bg-primary text-[13px] font-medium text-white">
              Save inbox
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
