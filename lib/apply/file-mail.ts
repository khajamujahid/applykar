import { access, readFile } from "node:fs/promises";
import type { VerificationLookup } from "@/lib/apply/browser";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function slug(employer: string): string {
  return employer.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "latest";
}

/**
 * Read a verification code or link dropped into a directory (used by local dry-runs
 * so the operator can paste mail from a test inbox without printing secrets).
 */
export function fileMailWaiter(dir: string | undefined = process.env.APPLYKAR_MAIL_DIR, attempts = Number(process.env.MAIL_WAIT_ATTEMPTS || 16)): VerificationLookup | undefined {
  if (!dir) return undefined;
  const root = dir;
  async function read(kind: "code" | "link", employer: string): Promise<string | null> {
    const names = [`${slug(employer)}.${kind}`, `latest.${kind}`, kind];
    for (let i = 0; i < attempts; i += 1) {
      for (const name of names) {
        const path = `${root.replace(/\/$/, "")}/${name}`;
        const text = await readFile(path, "utf8")
          .then((value) => value.trim())
          .catch(() => "");
        if (text) return text;
      }
      await sleep(8_000);
    }
    return null;
  }
  return {
    getCode: (employer) => read("code", employer),
    getLink: (employer) => read("link", employer),
  };
}

export async function mailDirReady(): Promise<boolean> {
  const dir = process.env.APPLYKAR_MAIL_DIR;
  if (!dir) return false;
  return access(dir).then(() => true).catch(() => false);
}
