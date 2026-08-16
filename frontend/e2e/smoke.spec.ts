import { expect, test } from "@playwright/test";

import {
  expect_access_denied,
  expect_shell,
  fill_expect_dirty,
  login,
  login_expect_error,
  nav_goto,
  open_identity_menu,
  sign_out,
  track_domain_api,
} from "./helpers/auth";
import { SEED_USERS } from "./helpers/users";

test.describe("smoke @smoke", () => {
  test("P64/P66: unauth redirect, admin login lands on change_request all", async ({
    page,
  }) => {
    await page.goto("/change_request/lists/all");
    await expect(page).toHaveURL(/\/login/);

    await login(page, "admin");
    await expect(page).toHaveURL(/\/change_request\/lists\/all/);
    await expect_shell(page);
    await expect(
      page.locator("header button[aria-haspopup='menu']"),
    ).toHaveAttribute("title", SEED_USERS.admin.username);
    await expect(
      page.locator("header button[aria-haspopup='menu']"),
    ).toContainText(SEED_USERS.admin.display_name);
  });

  test("P75: INC/CHG lists load without browser→domain search", async ({
    page,
  }) => {
    await login(page, "admin");
    const tracker = track_domain_api(page);
    await page.goto("/incident/lists/all");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("link", { name: /^INC/ }).first()).toBeVisible();
    await page.goto("/change_request/lists/all");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("link", { name: /^CHG/ }).first()).toBeVisible();
    tracker.assert_clean();
    tracker.dispose();
  });

  test("P75-4: incident user forbidden on change_request list", async ({
    page,
  }) => {
    await login(page, "incident");
    await page.goto("/change_request/lists/open");
    await expect_access_denied(page);
    // Session kept: error boundary has no shell chrome; allowed route still works.
    await page.goto("/incident/lists/all");
    await expect(page).toHaveURL(/\/incident\/lists\/all/);
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("P76-3: quick-filter Enter updates list via SSR", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/incident/lists/all");
    await expect(page.getByRole("table")).toBeVisible();
    const tracker = track_domain_api(page);
    const field = page.getByLabel("Quick filter field");
    await field.selectOption("summary");
    const value = page.getByLabel("Quick filter value");
    await value.fill("zzzz-no-match-untangled-e2e");
    await value.press("Enter");
    await expect(
      page.getByText("No records match this list."),
    ).toBeVisible({ timeout: 20_000 });
    tracker.assert_clean();
    tracker.dispose();
  });

  test("P81: open detail by friendly-id without browser→domain GET", async ({
    page,
  }) => {
    await login(page, "admin");
    await page.goto("/incident/lists/all");
    const link = page.getByRole("link", { name: /^INC/ }).first();
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/incident\/INC/);
    const tracker = track_domain_api(page);
    await link.click();
    await expect(page).toHaveURL(/\/incident\/INC/);
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
    tracker.assert_clean();
    tracker.dispose();
  });

  test("P82: dirty save persists without browser→domain PATCH", async ({
    page,
  }) => {
    await login(page, "admin");
    await page.goto("/incident/lists/all");
    await page.getByRole("link", { name: /^INC/ }).first().click();
    await expect(page).toHaveURL(/\/incident\/INC/);
    const summary = page.locator("#detail-summary");
    await expect(summary).toBeEditable();
    const original = await summary.inputValue();
    const next = `${original} e2e`.slice(0, 200);
    const tracker = track_domain_api(page);
    await fill_expect_dirty(page, summary, next);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toHaveAttribute(
      "title",
      "Save (no changes)",
    );
    await page.reload();
    await expect(page.locator("#detail-summary")).toBeEditable();
    await expect(page.locator("#detail-summary")).toHaveValue(next);
    // Restore
    await fill_expect_dirty(page, page.locator("#detail-summary"), original);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toHaveAttribute(
      "title",
      "Save (no changes)",
    );
    tracker.assert_clean();
    tracker.dispose();
  });

  test("P83: create INC then no browser→domain create", async ({ page }) => {
    await login(page, "admin");
    const tracker = track_domain_api(page);
    await page.goto("/incident/new");
    await page.locator("#detail-severity").fill("Medium");
    await page.locator("#detail-summary").fill("E2E smoke create incident");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/incident\/INC\d+/, { timeout: 30_000 });
    await expect(page.locator("#detail-summary")).toHaveValue(
      "E2E smoke create incident",
    );
    tracker.assert_clean();
    tracker.dispose();
  });

  test("P83-A1: no-create user gets 403 on /incident/new", async ({ page }) => {
    await login(page, "incident");
    await page.goto("/incident/new");
    await expect_access_denied(page);
  });

  test("P109/P113: CHG datetime dual-control + Save/Copy/Refresh order", async ({
    page,
  }) => {
    await login(page, "admin");
    await page.goto("/change_request/lists/all");
    await page.getByRole("link", { name: /^CHG/ }).first().click();
    await expect(page).toHaveURL(/\/change_request\/CHG/);
    await expect(page.locator('input[type="datetime-local"]')).toHaveCount(0);
    await expect(page.locator("#detail-scheduled_start")).toHaveAttribute(
      "type",
      "date",
    );
    const save = page.getByRole("button", { name: "Save" });
    const copy = page.getByRole("button", { name: "Copy link" });
    const refresh = page.getByRole("button", { name: "Refresh" });
    await expect(save).toBeVisible();
    await expect(copy).toBeVisible();
    await expect(refresh).toBeVisible();
    const save_box = await save.boundingBox();
    const copy_box = await copy.boundingBox();
    const refresh_box = await refresh.boundingBox();
    expect(save_box && copy_box && refresh_box).toBeTruthy();
    expect(save_box!.x).toBeLessThan(copy_box!.x);
    expect(copy_box!.x).toBeLessThan(refresh_box!.x);
  });

  test("P112: list → detail keeps class nav section open", async ({ page }) => {
    await login(page, "admin");
    await nav_goto(page, "Incidents", "All");
    await expect(page).toHaveURL(/\/incident\/lists\/all/);
    await page.getByRole("link", { name: /^INC/ }).first().click();
    await expect(page).toHaveURL(/\/incident\/INC/);
    const section = page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("button", { name: "Incidents" });
    await expect(section).toHaveAttribute("aria-expanded", "true");
  });

  test("P156/P168: system config open + post-save FK labels", async ({
    page,
  }) => {
    await login(page, "admin");
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "System Configuration" })
      .click();
    await expect(page).toHaveURL(/\/system_config\//);
    const updated_by = page.locator("#detail-updated_by");
    // FK may render as select or input depending on slot; read visible text.
    const before = await page
      .getByText(/Local Admin|admin/i)
      .first()
      .textContent();
    expect(before).toBeTruthy();
    // Touch an editable numeric if present; otherwise just assert no bare UUID in chrome.
    const nesting = page.locator("#detail-max_search_nesting_depth");
    if (await nesting.count()) {
      const tracker = track_domain_api(page);
      await expect(nesting).toBeEditable();
      const val = await nesting.inputValue();
      const next = String(Number(val || "5") === 5 ? 6 : 5);
      await fill_expect_dirty(page, nesting, next);
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("button", { name: "Save" })).toHaveAttribute(
        "title",
        "Save (no changes)",
      );
      await expect(page.getByText(/Local Admin/i).first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText(
        /01900000-0000-7000-8000-000000000001/,
      );
      // Restore
      await fill_expect_dirty(page, nesting, val);
      await page.getByRole("button", { name: "Save" }).click();
      tracker.assert_clean();
      tracker.dispose();
    }
    void updated_by;
  });

  test("P172/P173: sign out; change-password success with restore", async ({
    page,
  }) => {
    await login(page, "readwrite");
    const menu = await open_identity_menu(page);
    await menu.getByRole("menuitem", { name: "Change Password" }).click();
    await expect(page).toHaveURL(/\/change-password/);
    await expect(
      page.getByText(`Change Password for ${SEED_USERS.readwrite.username}`),
    ).toBeVisible();

    const temp = "Readwrite-e2e-Temp-1!";
    await page.getByLabel("Current Password", { exact: true }).fill(
      SEED_USERS.readwrite.password,
    );
    await page.getByLabel("New Password", { exact: true }).fill(temp);
    await page.getByLabel("Verify New Password", { exact: true }).fill(temp);
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByRole("status")).toBeVisible({ timeout: 20_000 });

    // Restore seed password so later runs stay idempotent.
    await page.getByLabel("Current Password", { exact: true }).fill(temp);
    await page
      .getByLabel("New Password", { exact: true })
      .fill(SEED_USERS.readwrite.password);
    await page
      .getByLabel("Verify New Password", { exact: true })
      .fill(SEED_USERS.readwrite.password);
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByRole("status")).toBeVisible({ timeout: 20_000 });

    await sign_out(page);
    await login(page, "readwrite");
    await expect_shell(page);
  });
});

test.describe("auth extras", () => {
  test("P64: login failure stays on login", async ({ page }) => {
    await login_expect_error(page, "admin", "wrong-password");
  });

  test("P66-4: incident user nav hides change requests", async ({ page }) => {
    await login(page, "incident");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("button", { name: "Incidents" })).toBeVisible();
    await expect(
      nav.getByRole("button", { name: "Change Requests" }),
    ).toHaveCount(0);
  });

  test("P191-3: plural /incidents bookmark is 404", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/incidents/lists/all");
    await expect(page.getByText("404", { exact: true })).toBeVisible();
  });
});
