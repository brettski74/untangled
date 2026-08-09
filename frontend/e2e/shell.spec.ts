import { expect, test } from "@playwright/test";

import {
  expect_shell,
  login,
  nav_goto,
  sign_out,
  track_domain_api,
} from "./helpers/auth";
import { SEED_USERS } from "./helpers/users";

test.describe("shell and auth", () => {
  test("P65: shell chrome regions present after login", async ({ page }) => {
    await login(page, "admin");
    await expect_shell(page);
    await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Help" })).toBeVisible();
  });

  test("P65-2: nav collapse preference restores on reload", async ({ page }) => {
    await login(page, "admin");
    await page.getByRole("button", { name: "Collapse navigation" }).click();
    await expect(
      page.getByRole("button", { name: "Expand navigation" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Expand navigation" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Expand navigation" }).click();
  });

  test("P65-3: Search expands without searching", async ({ page }) => {
    await login(page, "admin");
    const tracker = track_domain_api(page);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByPlaceholder(/Search/)).toBeVisible();
    tracker.assert_clean();
    tracker.dispose();
  });

  test("P66: nav sections and accordion", async ({ page }) => {
    await login(page, "admin");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("button", { name: "Change Requests" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Incidents" })).toBeVisible();
    await nav_goto(page, "Change Requests", "Open");
    await expect(page).toHaveURL(/\/change_request\/lists\/open/);
    await nav_goto(page, "Incidents", "Closed");
    await expect(page).toHaveURL(/\/incident\/lists\/closed/);
  });

  test("P172: identity menu open/dismiss/sign out", async ({ page }) => {
    await login(page, "admin");
    await page.locator("header button[aria-haspopup='menu']").click();
    const menu = page.getByRole("menu");
    await expect(
      menu.getByRole("menuitem", { name: "Change Password" }),
    ).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await sign_out(page);
  });

  test("P173: change-password validation and wrong current password", async ({
    page,
  }) => {
    await login(page, "admin");
    await page.locator("header button[aria-haspopup='menu']").click();
    await page.getByRole("menuitem", { name: "Change Password" }).click();
    await page.getByLabel("Current Password", { exact: true }).fill("wrong");
    await page.getByLabel("New Password", { exact: true }).fill("x");
    await page.getByLabel("Verify New Password", { exact: true }).fill("y");
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
  });
});
