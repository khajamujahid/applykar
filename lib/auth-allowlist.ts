import { safeEqual } from "@/lib/secret";

export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string | null | undefined, raw = process.env.ALLOWED_EMAILS): boolean {
  if (!email) return false;
  const allowed = parseAllowlist(raw);
  if (allowed.length === 0) return false;
  const normalized = email.trim().toLowerCase();
  return allowed.some((entry) => safeEqual(entry, normalized));
}
