import { expect, test } from "@playwright/test";

test("ask a question, watch it stream, see matrix and verdict, find it in history", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Offline fake mode")).toBeVisible();
  await expect(page.getByText(/Estimated cost: ~\$/)).toBeVisible();

  await page.getByLabel("Your question").fill("Should slow towers stack?");
  await page.getByLabel("Project brief").selectOption({ label: "Stronghold TD" });
  await page.getByRole("button", { name: "Ask the council" }).click();

  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+$/);
  // Live: seat columns fill in while streaming.
  await expect(page.getByRole("heading", { name: "Player Experience" })).toBeVisible();
  await expect(page.getByText("Brief: Stronghold TD (last edited")).toBeVisible();

  // Finished: verdict, minority report and vote matrix with a winner.
  await expect(page.getByRole("heading", { name: "Chairman's verdict" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Minority report")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "Vote matrix" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Borda total/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Done" }).or(page.getByText("Done", { exact: true }))).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/calls · cache reads/)).toBeVisible({ timeout: 45_000 });

  await page.getByRole("link", { name: "History" }).click();
  await expect(page.getByRole("link", { name: "Should slow towers stack?" })).toBeVisible();
});

test("chairman decides mode skips the vote", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Your question").fill("Quick one: refund rate?");
  await page.getByLabel(/Chairman decides/).check();
  await page.getByRole("button", { name: "Ask the council" }).click();
  await expect(page.getByText("No vote in this session")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "Chairman's verdict" })).toBeVisible();
});

test("brief editor creates and edits a brief", async ({ page }) => {
  await page.goto("/briefs");
  await page.getByRole("button", { name: "+ New brief" }).click();
  await page.getByLabel("Name").fill("Test Game");
  await page.getByLabel(/^Content/).fill("Core loop: test.");
  await page.getByRole("button", { name: "Create brief" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await page.getByLabel(/^Content/).fill("Core loop: changed.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await page.goto("/");
  await expect(page.getByLabel("Project brief").locator("option", { hasText: "Test Game" })).toHaveCount(1);
});
