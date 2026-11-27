/** Single-owner app: format every timestamp in the owner's zone so server and browser render the same text. */
export const OWNER_TZ = process.env.NEXT_PUBLIC_OWNER_TZ || "America/New_York";

export function clockTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: OWNER_TZ });
}

export function dayKey(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: OWNER_TZ });
}

export function shortDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: OWNER_TZ });
}

export function dateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: OWNER_TZ, month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
