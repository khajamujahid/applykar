/** True only on a Vercel *preview* deployment that was explicitly configured for an end-to-end test run. Never production. */
export function e2ePreview(): boolean {
  return process.env.VERCEL_ENV === "preview" && process.env.E2E_AUTH === "1" && Boolean(process.env.E2E_TOKEN);
}

export const E2E_EMAIL = "khaja@applykar.local";
