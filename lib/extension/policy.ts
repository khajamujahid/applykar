import { sourceFromUrl, type ApplySource } from "@/lib/apply/hosts";

export function isHandsOffHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "linkedin.com" || host.endsWith(".linkedin.com") || host === "indeed.com" || host.endsWith(".indeed.com");
  } catch {
    return false;
  }
}

/** The worker submits Greenhouse, Lever, Ashby, Workday, and iCIMS. Other sites stay on the page for autofill. */
export function serverApplySource(url: string): ApplySource | null {
  if (isHandsOffHost(url)) return null;
  return sourceFromUrl(url);
}
