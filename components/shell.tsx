"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Briefcase, Keyboard, LogOut, Plus, Settings, UserRound } from "lucide-react";
import { signOutAction, switchProfileAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

type ProfileLink = { id: string; name: string };

const nav = [
  { href: "/feed", label: "Feed" },
  { href: "/applications", label: "Tracker" },
  { href: "/inbox", label: "Inbox" },
  { href: "/profiles", label: "Profiles" },
  { href: "/settings", label: "Settings" },
];

export function Shell({
  email,
  profileName,
  profiles,
  children,
}: {
  email: string;
  profileName: string;
  profiles: ProfileLink[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "?" && !isTyping(event.target)) {
        event.preventDefault();
        setHelp(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sidebar = (
    <div className="flex h-full flex-col gap-4 p-3 text-[13px]">
      <Link href="/feed" className="flex items-center gap-2 px-2 font-medium tracking-tight">
        <span className="grid size-6 place-items-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">A</span>
        Applykar
      </Link>
      <nav className="grid gap-0.5">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-2 py-1.5 ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto grid gap-2">
        <div className="rounded-lg border border-border px-2 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Active profile</p>
          <p className="mt-1 truncate font-medium">{profileName}</p>
          <div className="mt-2 grid gap-1">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className="truncate rounded px-1 py-0.5 text-left text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => switchProfileAction(profile.id)}
              >
                {profile.name}
              </button>
            ))}
          </div>
        </div>
        <p className="truncate px-1 text-[11px] text-muted-foreground">{email}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-[13px] text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-sidebar lg:block">{sidebar}</aside>
        <div className="min-w-0">
          <header className="flex h-12 items-center gap-2 border-b border-border px-3 lg:px-4">
            <Sheet>
              <SheetTrigger className="lg:hidden" render={<Button variant="ghost" size="icon-sm" aria-label="Open navigation" />}>
                <Briefcase />
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                {sidebar}
              </SheetContent>
            </Sheet>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex h-8 flex-1 items-center justify-between rounded-md border border-border bg-card px-2 text-muted-foreground sm:max-w-sm"
            >
              <span>Search or jump</span>
              <kbd className="rounded border border-border px-1 text-[10px]">⌘K</kbd>
            </button>
            <Button variant="ghost" size="icon-sm" aria-label="Shortcuts" onClick={() => setHelp(true)}>
              <Keyboard />
            </Button>
            <form action={signOutAction}>
              <Button variant="ghost" size="icon-sm" type="submit" aria-label="Sign out">
                <LogOut />
              </Button>
            </form>
          </header>
          <main className="min-w-0">{children}</main>
        </div>
      </div>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Jump to a page or profile" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          <CommandGroup heading="Go">
            {nav.map((item) => (
              <CommandItem
                key={item.href}
                onSelect={() => {
                  setOpen(false);
                  router.push(item.href);
                }}
              >
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Profiles">
            {profiles.map((profile) => (
              <CommandItem
                key={profile.id}
                onSelect={() => {
                  setOpen(false);
                  void switchProfileAction(profile.id);
                }}
              >
                <UserRound />
                {profile.name}
              </CommandItem>
            ))}
            <CommandItem
              onSelect={() => {
                setOpen(false);
                router.push("/profiles");
              }}
            >
              <Plus />
              New profile
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem
              onSelect={() => {
                setOpen(false);
                router.push("/settings");
              }}
            >
              <Settings />
              Ingest and shortcuts
              <CommandShortcut>?</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <CommandDialog open={help} onOpenChange={setHelp}>
        <CommandInput placeholder="Shortcuts" />
        <CommandList>
          <CommandGroup heading="Feed">
            {[
              ["j / k", "Next and previous role"],
              ["s", "Save"],
              ["h", "Hide"],
              ["a", "Queue"],
              ["o", "Open the apply link"],
              ["/", "Focus search"],
              ["⌘K", "Command palette"],
            ].map(([key, label]) => (
              <CommandItem key={key} disabled>
                <span className="w-14 text-muted-foreground">{key}</span>
                {label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}
