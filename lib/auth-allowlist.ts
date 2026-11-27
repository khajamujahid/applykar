import { E2E_EMAIL, e2ePreview } from "@/lib/e2e";
import { safeEqual } from "@/lib/secret";

function allowlistEnv(): string | undefined {
  return e2ePreview() ? `${process.env.ALLOWED_EMAILS ?? ""},${E2E_EMAIL}` : process.env.ALLOWED_EMAILS;
}

export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string | null | undefined, raw = allowlistEnv()): boolean {
  if (!email) return false;
  const allowed = parseAllowlist(raw);
  if (allowed.length === 0) return false;
  const normalized = email.trim().toLowerCase();
  return allowed.some((entry) => safeEqual(entry, normalized));
}
