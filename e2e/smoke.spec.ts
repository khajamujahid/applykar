import { expect, test } from "@playwright/test";

test("signs in, filters the feed, queues a role, and marks it applied", async ({ page }) => {
  await page.goto("/api/test/session");
  await expect(page.getByTestId("job-card").first()).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("filter-greenhouse").click();
  await expect(page.getByTestId("job-card").first()).toHaveAttribute("data-source", "greenhouse");

  await page.getByTestId("queue-job").click();
  await page.goto("/applications");
  await expect(page.getByTestId("application-row").first()).toBeVisible();
  await page.getByTestId("proof-note").first().fill("Confirmation email from the employer");
  await page.getByTestId("mark-applied").first().click();
  await expect(page.getByText("Applied").first()).toBeVisible();
});
