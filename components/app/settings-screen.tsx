"use client";

import { useState, useTransition } from "react";
import { Bell, Check, Copy, Cpu, Shield, UserRound, Zap } from "lucide-react";
import { saveSettingsAction, signOutAction } from "@/app/actions";
import { ExtensionPair } from "@/components/extension-pair";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type Settings = { autoApply: boolean; dailyLimit: number; batchSize: number; skipW2Only: boolean; sevenDaysOnly: boolean; notifyEmail: boolean };

const NAV = [
  { id: "account", label: "Account", icon: UserRound },
  { id: "auto-apply", label: "Auto-apply", icon: Zap },
  { id: "extension", label: "Chrome extension", icon: Shield },
  { id: "ai", label: "AI & MCP", icon: Cpu },
  { id: "notifications", label: "Notifications", icon: Bell },
];

export function SettingsScreen({ email, settings, mcp, ai }: { email: string; settings: Settings; mcp: { url: string; token: string | null }; ai: { configured: boolean; model: string } }) {
  const [s, setS] = useState(settings);
  const [, start] = useTransition();
  const [section, setSection] = useState("auto-apply");
  const [copied, setCopied] = useState(false);
  const [connect, setConnect] = useState(false);
  const save = (patch: Partial<Settings>) => {
    setS((v) => ({ ...v, ...patch }));
    start(() => saveSettingsAction(patch));
  };
  const go = (id: string) => {
    setSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div className="flex h-full bg-[#fbfbfd]">
      <aside className="hidden w-[210px] shrink-0 border-r border-border bg-white px-3 py-5 md:block">
        {NAV.map((n) => {
          const Icon = n.icon;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => go(n.id)}
              className={`mb-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] ${section === n.id ? "bg-[#f1effd] font-medium text-[#2f2496]" : "text-[#2b2a3d] hover:bg-muted"}`}
            >
              <Icon className="size-4" strokeWidth={1.8} /> {n.label}
            </button>
          );
        })}
      </aside>
      <div className="scroll-thin min-w-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-[620px] space-y-4">
          <Card id="auto-apply" title="Auto-apply">
            <Row label="Background auto-apply" hint="When on, Applykar submits applications. When off, it fills each form and stops before submit.">
              <OnOff checked={s.autoApply} onChange={(v) => save({ autoApply: v })} />
            </Row>
            <Row label="Daily apply limit">
              <Slider value={s.dailyLimit} min={1} max={100} onChange={(v) => setS((x) => ({ ...x, dailyLimit: v }))} onCommit={(v) => save({ dailyLimit: v })} />
            </Row>
            <Row label="Apply batch size">
              <Slider value={s.batchSize} min={1} max={50} onChange={(v) => setS((x) => ({ ...x, batchSize: v }))} onCommit={(v) => save({ batchSize: v })} />
            </Row>
            <Row label="Skip W2-only roles">
              <OnOff checked={s.skipW2Only} onChange={(v) => save({ skipW2Only: v })} />
            </Row>
            <Row label="Only jobs posted in last 7 days">
              <OnOff checked={s.sevenDaysOnly} onChange={(v) => save({ sevenDaysOnly: v })} />
            </Row>
          </Card>
          <Card id="extension" title="Chrome extension">
            <a href="/applykar-extension.zip" download className="inline-flex h-9 items-center rounded-lg bg-primary px-6 text-[13px] font-medium text-white">
              Download extension
            </a>
            <p className="mt-2 text-[12px] text-muted-foreground">Unzip, open chrome://extensions, turn on Developer mode, then Load unpacked. Pair it below.</p>
            <div className="mt-3">
              <ExtensionPair />
            </div>
          </Card>
          <Card id="ai" title="AI & MCP">
            <div className="flex items-center gap-2 text-[13px]">
              MCP token <span className="tracking-[2px] text-[#3f3e55]">{mcp.token ? "••••••••" : "not set"}</span>
              {mcp.token ? (
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(mcp.token!);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="inline-flex items-center gap-1 text-[#2f2496] underline underline-offset-2"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
                </button>
              ) : null}
            </div>
            <button type="button" onClick={() => setConnect(true)} className="mt-3 h-9 rounded-lg border border-[#2f2496] px-4 text-[13px] font-medium text-[#2f2496] hover:bg-[#f6f4ff]">
              Connect ChatGPT / Claude / Grok
            </button>
            <p className="mt-3 text-[12px] text-muted-foreground">
              Applykar AI: Vercel AI Gateway · {ai.model} · {ai.configured ? "key set" : "not configured"}. If the gateway is unavailable the assistant and tailoring use the built-in rules engine.
            </p>
          </Card>
          <Card id="notifications" title="Notifications">
            <Row label="Email me when an application needs info">
              <OnOff checked={s.notifyEmail} onChange={(v) => save({ notifyEmail: v })} />
            </Row>
          </Card>
          <Card id="account" title="Account">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full border border-border bg-white text-[17px] font-bold">
                <span className="bg-gradient-to-r from-[#4285F4] via-[#EA4335] to-[#FBBC05] bg-clip-text text-transparent">G</span>
              </span>
              <span className="text-[13.5px]">{email}</span>
              <form action={signOutAction} className="ml-auto">
                <button type="submit" className="h-9 rounded-lg border border-[#2f2496] px-5 text-[13px] font-medium text-[#2f2496] hover:bg-[#f6f4ff]">
                  Sign out
                </button>
              </form>
            </div>
          </Card>
        </div>
      </div>
      <Dialog open={connect} onOpenChange={setConnect}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle>Connect an AI assistant</DialogTitle>
          <div className="space-y-3 text-[13px]">
            <p>Add Applykar as a remote MCP server (Streamable HTTP) in ChatGPT, Claude, or Grok:</p>
            <div className="rounded-lg bg-muted p-3 font-mono text-[12px]">
              <div>URL: {mcp.url}</div>
              <div>Header: Authorization: Bearer &lt;MCP token&gt;</div>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-[#3f3e55]">
              <li>ChatGPT: Settings → Connectors → Add custom connector.</li>
              <li>Claude: Settings → Connectors → Add custom connector.</li>
              <li>Grok: Settings → Connectors / MCP → Add server.</li>
            </ul>
            <p className="text-[12px] text-muted-foreground">Tools: search jobs, get job, queue applications, list applications, profiles.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Card({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 rounded-xl border border-border bg-white px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <h2 className="mb-3 text-[15.5px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-[13.5px]">
      <div>
        <p>{label}</p>
        {hint ? <p className="text-[11.5px] text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function OnOff({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-[50px] shrink-0 items-center rounded-full transition ${checked ? "bg-[#2f2496]" : "bg-[#d9d7e6]"}`}
    >
      <span className={`absolute text-[10px] font-semibold text-white ${checked ? "left-2" : "right-2"}`}>{checked ? "ON" : "OFF"}</span>
      <span className={`absolute size-[22px] rounded-full bg-white shadow transition-all ${checked ? "left-[25px]" : "left-[3px]"}`} />
    </button>
  );
}

function Slider({ value, min, max, onChange, onCommit }: { value: number; min: number; max: number; onChange: (v: number) => void; onCommit: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-4">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        className="h-1.5 w-[220px] cursor-pointer appearance-none rounded-full accent-[#4a3bd4]"
        style={{ background: `linear-gradient(to right, #4a3bd4 ${pct}%, #e3e1ee ${pct}%)` }}
      />
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        onBlur={(e) => onCommit(Number(e.target.value))}
        className="h-9 w-[52px] rounded-lg border border-input text-center text-[13px]"
      />
    </div>
  );
}
