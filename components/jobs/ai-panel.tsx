"use client";

import { clockTime } from "@/lib/time";
import { useEffect, useRef, useState } from "react";
import { CheckCheck, Loader2, MoreHorizontal, SendHorizontal, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ChatMessageView = { role: string; content: string; createdAt: string; jobs?: { id: string; title: string; companyName: string; score: number }[]; navigate?: string };

const CHIPS = ["Find Python jobs", "Apply to top 20", "Best match jobs", "Show me remote only"];

function clock(iso: string) {
  return clockTime(iso);
}

export function AiPanel({
  firstName,
  newCount,
  initialMessages,
  onOpenJob,
  onNavigate,
  onQueued,
}: {
  firstName: string;
  newCount: number;
  initialMessages: ChatMessageView[];
  onOpenJob: (id: string) => void;
  onNavigate: (href: string) => void;
  onQueued: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  async function send(message: string) {
    const content = message.trim();
    if (!content || busy) return;
    setText("");
    setMessages((m) => [...m, { role: "user", content, createdAt: new Date().toISOString() }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: content }) });
      const body = (await res.json()) as { reply?: string; error?: string; jobs?: ChatMessageView["jobs"]; navigate?: string; queued?: number; engine?: string };
      setEngine(body.engine ?? null);
      setMessages((m) => [...m, { role: "assistant", content: body.reply ?? body.error ?? "Something went wrong.", createdAt: new Date().toISOString(), jobs: body.jobs, navigate: body.navigate }]);
      if (body.queued) onQueued();
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "I couldn't reach the server. Try again.", createdAt: new Date().toISOString() }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="hidden w-[292px] shrink-0 flex-col border-r border-border bg-white lg:flex">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div className="flex items-center gap-2 text-[15px] font-semibold">
          <Sparkles className="size-[18px] fill-[#4a3bd4] text-[#4a3bd4]" /> Applykar AI
        </div>
        <Popover>
          <PopoverTrigger className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Chat options">
            <MoreHorizontal className="size-4" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <button
              type="button"
              className="w-full rounded px-2 py-1.5 text-left text-[12.5px] hover:bg-muted"
              onClick={async () => {
                await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reset: true }) });
                setMessages([]);
              }}
            >
              Clear conversation
            </button>
          </PopoverContent>
        </Popover>
      </div>
      <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        <div className="flex items-center gap-3 py-1">
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#efeafe] text-[20px]">🤖</div>
          <p className="text-[13px] font-medium leading-snug">
            Hi {firstName},<br />
            {newCount.toLocaleString("en-US")} new jobs match
            <br />
            you today
          </p>
        </div>
        <Bubble role="assistant" time={messages[0]?.createdAt}>
          Hi! I&apos;m Applykar AI. I can find jobs, tailor your applications, and auto-apply on your behalf. What would you like to do?
        </Bubble>
        {messages.map((m, i) => (
          <div key={i}>
            <Bubble role={m.role} time={m.createdAt}>
              {m.content}
            </Bubble>
            {m.jobs?.length ? (
              <div className="ml-8 mt-1.5 space-y-1">
                {m.jobs.slice(0, 5).map((j) => (
                  <button key={j.id} type="button" onClick={() => onOpenJob(j.id)} className="block w-full truncate rounded-md border border-border px-2 py-1 text-left text-[12px] hover:border-[#cfc9f5]">
                    <span className="font-medium">{j.title}</span> · {j.companyName} · <span className="text-primary">{j.score}%</span>
                  </button>
                ))}
                {m.navigate ? (
                  <button type="button" onClick={() => onNavigate(m.navigate!)} className="text-[12px] font-medium text-primary">
                    Show all in the feed →
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
        {busy ? (
          <div className="ml-8 flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Thinking…
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          {CHIPS.map((chip) => (
            <button key={chip} type="button" onClick={() => void send(chip)} className="rounded-lg border border-[#dcd8f3] bg-[#faf9ff] px-2.5 py-1.5 text-[12px] text-[#2f2496] hover:border-[#bdb4f4]">
              {chip}
            </button>
          ))}
        </div>
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
        className="m-3 flex items-center gap-2 rounded-xl border border-input bg-white py-1.5 pl-3 pr-1.5 shadow-sm"
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask anything..." className="h-9 flex-1 bg-transparent text-[13px] outline-none" />
        <button type="submit" disabled={busy} aria-label="Send" className="grid size-9 place-items-center rounded-full bg-primary text-white disabled:opacity-60">
          <SendHorizontal className="size-4" />
        </button>
      </form>
      {engine && engine.startsWith("rules") ? <p className="-mt-1 px-4 pb-2 text-[10.5px] text-muted-foreground">Smart rules mode · {engine.replace(/^rules \(?/, "").replace(/\)$/, "") || "AI off"}</p> : null}
    </aside>
  );
}

function Bubble({ role, time, children }: { role: string; time?: string; children: React.ReactNode }) {
  const mine = role === "user";
  return (
    <div className={`flex gap-2 ${mine ? "justify-end" : ""}`}>
      {!mine ? <div className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-[#efeafe] text-[11px] text-primary">•••</div> : null}
      <div className={`max-w-[220px] ${mine ? "text-right" : ""}`}>
        <div
          className={`whitespace-pre-wrap rounded-xl border px-3 py-2 text-left text-[12.5px] leading-relaxed ${
            mine ? "border-[#e3dffa] bg-[#f4f2fe]" : "border-border bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
          }`}
        >
          {children}
        </div>
        {time ? (
          <div className={`mt-1 flex items-center gap-1 text-[10.5px] text-muted-foreground ${mine ? "justify-end" : ""}`}>
            {clock(time)}
            {mine ? <CheckCheck className="size-3 text-primary" /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
