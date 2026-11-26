/** Signed-in smoke test against a running Applykar (local `next start` on a Neon test branch). */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import pg from "pg";

const base = process.env.SMOKE_BASE || "http://localhost:4317";
const email = process.env.SMOKE_EMAIL || "khajamujahiddin@gmail.com";
const out = "data/smoke";

(async () => {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror ${page.url()}: ${error.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console ${page.url()}: ${msg.text().slice(0, 200)}`);
  });
  const results: Record<string, unknown>[] = [];
  await page.goto(`${base}/api/test/session?email=${encodeURIComponent(email)}`);
  for (const path of ["/feed", "/applications", "/inbox", "/profiles", "/settings", "/onboarding"]) {
    const response = await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => null);
    await page.waitForTimeout(1500);
    const name = path.slice(1) || "home";
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
    const body = await page.locator("body").innerText().catch(() => "");
    results.push({ path, status: response?.status() ?? 0, finalUrl: page.url(), errorText: /application error|something went wrong|unhandled/i.test(body) });
  }
  await page.goto(`${base}/feed`, { waitUntil: "networkidle" });
  const cards = await page.getByTestId("job-card").count();
  let filterOk: boolean | null = null;
  const gh = page.getByTestId("filter-greenhouse");
  if (await gh.count()) {
    await gh.click();
    await page.waitForTimeout(2500);
    filterOk = (await page.getByTestId("job-card").first().getAttribute("data-source")) === "greenhouse";
    await gh.click();
    await page.waitForTimeout(1500);
  }
  await page.getByTestId("bulk-apply").click();
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${out}/feed-after-apply20.png` });
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const queued = await db.query("SELECT source, count(*)::int n FROM bulk_items GROUP BY 1");
  await db.end();
  await browser.close();
  console.log(JSON.stringify({ results, cards, filterOk, queued: queued.rows, errors: errors.slice(0, 30) }, null, 2));
})();
