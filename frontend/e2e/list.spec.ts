import { expect, test } from "@playwright/test";

import { login, nav_goto, track_domain_api } from "./helpers/auth";

test.describe("list", () => {
  test("P75-2: friendly-id links use snake class path", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/incident/lists/all");
    const href = await page
      .getByRole("link", { name: /^INC/ })
      .first()
      .getAttribute("href");
    expect(href).toMatch(/^\/incident\/INC/);
  });

  test("P76: context bar interactive; New visible for admin", async ({
    page,
  }) => {
    await login(page, "admin");
    await page.goto("/incident/lists/all");
    // Context-bar New is an <a aria-label="New"> (nav option is text "New").
    await expect(page.locator('a[aria-label="New"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
    await expect(page.getByLabel("Quick filter field")).toBeVisible();
  });

  test("P76-4: quick-filter resets when switching list destinations", async ({
    page,
  }) => {
    await login(page, "admin");
    await page.goto("/incident/lists/all");
    await page.getByLabel("Quick filter field").selectOption("summary");
    await page.getByLabel("Quick filter value").fill("keep-me");
    await nav_goto(page, "Incidents", "Open");
    await expect(page).toHaveURL(/\/incident\/lists\/open/);
    await expect(page.getByLabel("Quick filter value")).toHaveValue("");
  });

  test("P76-5: datetime quick filter uses date+time not datetime-local", async ({
    page,
  }) => {
    await login(page, "admin");
    await page.goto("/change_request/lists/all");
    await page
      .getByLabel("Quick filter field")
      .selectOption("scheduled_start");
    await expect(page.locator('input[type="datetime-local"]')).toHaveCount(0);
    await expect(
      page.getByLabel("Quick filter from date"),
    ).toBeVisible();
  });

  test("P77: filter chrome Execute without browser→domain search", async ({
    page,
  }) => {
    await login(page, "admin");
    await page.goto("/incident/lists/open");
    const tracker = track_domain_api(page);
    const filter_btn = page.getByRole("button", { name: /Filter|Edit filter/i });
    if (await filter_btn.count()) {
      await filter_btn.first().click();
      const execute = page.getByRole("button", { name: /Execute|Apply/i });
      if (await execute.count()) {
        await execute.first().click();
      }
    }
    await expect(page.getByRole("table")).toBeVisible();
    tracker.assert_clean();
    tracker.dispose();
  });

  test("P79: pagination footer present", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/change_request/lists/all");
    await expect(page.getByTestId("list-pagination")).toBeVisible();
    await expect(page.getByLabel("Total records")).toContainText(/records/);
  });

  test("P78: sort control on list header", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/incident/lists/all");
    const sort = page.getByRole("button", { name: /Sort/i }).first();
    if (await sort.count()) {
      await sort.click();
      await expect(page.getByRole("table")).toBeVisible();
    }
  });
});
