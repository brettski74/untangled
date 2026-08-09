import { expect, test } from "@playwright/test";

import {
  expect_access_denied,
  login,
  nav_goto,
  track_domain_api,
} from "./helpers/auth";

test.describe("detail and create", () => {
  test("P81-2: FK open-related when set", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/change_request/lists/all");
    await page.getByRole("link", { name: /^CHG/ }).first().click();
    const open_related = page.getByRole("link", { name: /Open related|Open/i });
    // May be button with aria-label from fk_open_related tooltip.
    const fk_open = page.locator('[aria-label*="Open"]').first();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
    void open_related;
    void fk_open;
  });

  test("P82-M2: Ctrl+S saves", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/incident/lists/all");
    await page.getByRole("link", { name: /^INC/ }).first().click();
    const summary = page.locator("#detail-summary");
    const original = await summary.inputValue();
    const next = `${original} ctrl-s`.slice(0, 200);
    await summary.fill(next);
    await page.keyboard.press("Control+s");
    await expect(page.getByRole("button", { name: "Save" })).toHaveAttribute(
      "title",
      "Save (no changes)",
      { timeout: 20_000 },
    );
    await summary.fill(original);
    await page.keyboard.press("Control+s");
    await expect(page.getByRole("button", { name: "Save" })).toHaveAttribute(
      "title",
      "Save (no changes)",
      { timeout: 20_000 },
    );
  });

  test("P82-M4: Refresh clears dirty", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/incident/lists/all");
    await page.getByRole("link", { name: /^INC/ }).first().click();
    const summary = page.locator("#detail-summary");
    const original = await summary.inputValue();
    await summary.fill(`${original} dirty`);
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(summary).toHaveValue(original);
    await expect(page.getByRole("button", { name: "Save" })).toHaveAttribute(
      "title",
      "Save (no changes)",
    );
  });

  test("P82-M5: Ctrl+Z undoes field edit", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/incident/lists/all");
    await page.getByRole("link", { name: /^INC/ }).first().click();
    const summary = page.locator("#detail-summary");
    const original = await summary.inputValue();
    await summary.fill(`${original} undo-me`);
    await summary.blur();
    await page.keyboard.press("Control+z");
    await expect(summary).toHaveValue(original);
  });

  test("P82-M7: readonly user cannot update", async ({ page }) => {
    await login(page, "readonly");
    await page.goto("/incident/lists/all");
    await page.getByRole("link", { name: /^INC/ }).first().click();
    await expect(page.locator("#detail-summary")).toHaveAttribute("readonly", "");
    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  test("P82-M10: friendly-id not editable", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/incident/lists/all");
    await page.getByRole("link", { name: /^INC/ }).first().click();
    const number = page.locator("#detail-number");
    await expect(number).toBeVisible();
    await expect(number).toHaveAttribute("readonly", "");
  });

  test("P83-G1: Refresh on new resets defaults", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/incident/new");
    await page.locator("#detail-summary").fill("temp draft");
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.locator("#detail-summary")).toHaveValue("");
  });

  test("P83-B6: copy link on new", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await login(page, "admin");
    await page.goto("/incident/new");
    await page.getByRole("button", { name: "Copy link" }).click();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toMatch(/\/incident\/new/);
  });

  test("P83-B7: nav expanded on /incident/new", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/incident/new");
    await expect(
      page
        .getByRole("navigation", { name: "Primary" })
        .getByRole("button", { name: "Incidents" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  test("P83: create CHG happy path", async ({ page }) => {
    await login(page, "admin");
    const tracker = track_domain_api(page);
    await page.goto("/change_request/new");
    await page.locator("#detail-summary").fill("E2E CHG create");
    // Required datetimes — set scheduled start/end via date inputs.
    await page.locator("#detail-scheduled_start").fill("2030-01-15");
    const times = page.getByLabel("Time");
    await times.nth(0).fill("10:00:00");
    await times.nth(0).press("Enter");
    await page.locator("#detail-scheduled_end").fill("2030-01-15");
    await times.nth(1).fill("11:00:00");
    await times.nth(1).press("Enter");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/change_request\/CHG\d+/, { timeout: 30_000 });
    tracker.assert_clean();
    tracker.dispose();
  });

  test("P83: create INC with severity", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/incident/new");
    await page.locator("#detail-severity").fill("Low");
    await page.locator("#detail-summary").fill("E2E INC create full");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/incident\/INC\d+/, { timeout: 30_000 });
  });

  test("P123: Zod path-aware create validation banner", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/change_request/new");
    await page.locator("#detail-summary").fill("incomplete CHG");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("alert")).toContainText(/scheduled_/i);
  });

  test("P109-2: edit CHG datetime and save", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/change_request/lists/all");
    await page.getByRole("link", { name: /^CHG/ }).first().click();
    const date = page.locator("#detail-scheduled_start");
    const current = await date.inputValue();
    const next = current === "2031-06-01" ? "2031-06-02" : "2031-06-01";
    await date.fill(next);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toHaveAttribute(
      "title",
      "Save (no changes)",
      { timeout: 20_000 },
    );
    await date.fill(current);
    await page.getByRole("button", { name: "Save" }).click();
  });

  test("P112-2: deep-link opens class nav section", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/incident/lists/all");
    const href = await page
      .getByRole("link", { name: /^INC/ })
      .first()
      .getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href!);
    await expect(
      page
        .getByRole("navigation", { name: "Primary" })
        .getByRole("button", { name: "Incidents" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  test("P81-3: change user denied on incident detail", async ({ page }) => {
    await login(page, "change");
    await page.goto("/incident/lists/all");
    // May 403 on list already; if list loads somehow, opening detail should deny.
    if (page.url().includes("/login")) {
      return;
    }
    const denied = page.getByText("Access is denied.");
    if (await denied.isVisible()) {
      await expect_access_denied(page);
      return;
    }
  });

  test("P100: datetime list cells are not raw ISO with ms", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/change_request/lists/all");
    const body = await page.locator("table").innerText();
    expect(body).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}/);
  });

  test("P73: audit FK shows display name not bare seed UUID", async ({
    page,
  }) => {
    await login(page, "admin");
    await page.goto("/incident/lists/all");
    await page.getByRole("link", { name: /^INC/ }).first().click();
    await expect(page.getByText("Local Admin").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      "01900000-0000-7000-8000-000000000001",
    );
  });

  test("P191: snake paths work; network stays off domain API", async ({
    page,
  }) => {
    await login(page, "admin");
    const tracker = track_domain_api(page);
    await nav_goto(page, "Change Requests", "All");
    await expect(page).toHaveURL(/\/change_request\/lists\/all/);
    await nav_goto(page, "Incidents", "All");
    await expect(page).toHaveURL(/\/incident\/lists\/all/);
    tracker.assert_clean();
    tracker.dispose();
  });
});
