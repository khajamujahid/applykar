"use client";

import { useRouter } from "next/navigation";

/** Table row that opens the full-screen application page (inner links/buttons keep their own behaviour). */
export function AppliedRowLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        router.push(href);
      }}
      className="cursor-pointer border-b border-border last:border-0 hover:bg-[#fbfaff]"
    >
      {children}
    </tr>
  );
}
