"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyPacket({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }}
    >
      {copied ? "Copied" : "Copy answers"}
    </Button>
  );
}
