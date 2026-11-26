"use client";

import { useState } from "react";
import { createExtensionTokenAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ExtensionPair() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setError(null);
          void createExtensionTokenAction()
            .then(setToken)
            .catch(() => setError("Could not create a token."));
        }}
      >
        Create pairing token
      </Button>
      {token ? (
        <label className="grid gap-1 text-[12px] text-muted-foreground">
          Paste this into the extension once. It is not shown again.
          <Input readOnly value={token} onFocus={(event) => event.currentTarget.select()} />
        </label>
      ) : null}
      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}
