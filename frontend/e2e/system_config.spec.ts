import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";

test.describe("system config", () => {
  test("P156: non-admin with read can open system configuration", async ({
    page,
  }) => {
    await login(page, "readonly");
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "System Configuration" })
      .click();
    await expect(page).toHaveURL(/\/system_config\//);
    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  test("P5/P161-M9: stack smoke — login and land", async ({ page }) => {
    await login(page, "admin");
    await expect(page).toHaveURL(/\/change_request\/lists\/all/);
  });
});
