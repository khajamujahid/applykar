"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleCheckBig, House, Mail, Settings, UserRound } from "lucide-react";

const nav = [
  { href: "/feed", label: "Jobs", icon: House },
  { href: "/applications", label: "Applied", icon: CircleCheckBig },
  { href: "/profiles", label: "Profiles", icon: UserRound },
  { href: "/inbox", label: "Email integration", icon: Mail },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Shell({ email, profileName, children }: { email: string; profileName: string; profiles?: { id: string; name: string }[]; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex h-screen flex-col bg-background text-[13px] text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-6 border-b border-border bg-white px-4">
        <Link href="/feed" className="text-[19px] font-semibold tracking-tight text-[#2f2496]">
          Applykar
        </Link>
        <nav className="flex h-full items-stretch gap-1 overflow-x-auto">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[13px] transition-colors ${
                  active ? "border-primary font-medium text-[#2f2496]" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-[15px]" strokeWidth={1.8} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto hidden items-center gap-2 text-[12px] text-muted-foreground md:flex">
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">{profileName}</span>
          <span className="max-w-[200px] truncate">{email}</span>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
