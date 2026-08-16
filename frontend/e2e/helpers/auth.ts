import { expect, type Locator, type Page, type Request } from "@playwright/test";

import { SEED_USERS, type SeedUserKey } from "./users";

/** True if the browser request targets the domain API (not auth-session). */
export function is_domain_api_request(request: Request): boolean {
  const url = request.url();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (
    parsed.pathname === "/api/v2/auth" ||
    parsed.pathname.startsWith("/api/v2/auth/")
  ) {
    return false;
  }
  if (
    (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") &&
    parsed.port === "8000"
  ) {
    return true;
  }
  return (
    parsed.pathname.startsWith("/api/v1/") ||
    parsed.pathname.startsWith("/api/v2/")
  );
}

/**
 * Attach a listener that records forbidden browser→domain API calls.
 * Call ``assert_clean`` after the interaction under test.
 */
export function track_domain_api(page: Page): {
  assert_clean: () => void;
  dispose: () => void;
} {
  const hits: string[] = [];
  const on_request = (request: Request) => {
    if (is_domain_api_request(request)) {
      hits.push(`${request.method()} ${request.url()}`);
    }
  };
  page.on("request", on_request);
  return {
    assert_clean: () => {
      expect(
        hits,
        `browser must not call domain API: ${hits.join("; ")}`,
      ).toEqual([]);
    },
    dispose: () => {
      page.off("request", on_request);
    },
  };
}

export async function login(
  page: Page,
  user: SeedUserKey = "admin",
): Promise<void> {
  const creds = SEED_USERS[user];
  await page.goto("/login");
  await page.getByLabel("Username").fill(creds.username);
  await page.getByLabel("Password").fill(creds.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function login_expect_error(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText(
    /Access denied|required/i,
  );
  await expect(page).toHaveURL(/\/login/);
}

/** Open the header identity menu and wait until it is visible. */
export async function open_identity_menu(page: Page): Promise<Locator> {
  await page.locator("header button[aria-haspopup='menu']").click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  return menu;
}

export async function sign_out(page: Page): Promise<void> {
  const menu = await open_identity_menu(page);
  await menu.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

export async function expect_access_denied(page: Page): Promise<void> {
  await expect(page.getByText("403", { exact: true })).toBeVisible();
  await expect(page.getByText("Access is denied.")).toBeVisible();
}

export async function expect_shell(page: Page): Promise<void> {
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
}

/** Open a class section option in the primary nav (e.g. Incidents → All). */
export async function nav_goto(
  page: Page,
  section: string,
  option: string,
): Promise<void> {
  const nav = page.getByRole("navigation", { name: "Primary" });
  const section_btn = nav.getByRole("button", { name: section });
  if ((await section_btn.getAttribute("aria-expanded")) !== "true") {
    await section_btn.click();
  }
  await expect(section_btn).toHaveAttribute("aria-expanded", "true");
  const section_id = await section_btn.getAttribute("aria-controls");
  expect(section_id, `nav section "${section}" is missing aria-controls`).toBeTruthy();
  await nav
    .locator(`#${section_id}`)
    .getByRole("link", { name: option, exact: true })
    .click();
}

/**
 * Fill a detail field and assert the value stuck and Save became dirty.
 * Does not click Save. Fails if the field is not editable or the value snaps back.
 */
export async function fill_expect_dirty(
  page: Page,
  field: Locator,
  value: string,
): Promise<void> {
  await expect(field).toBeVisible();
  await expect(field).toBeEditable();
  await field.fill(value);
  await expect(field).toHaveValue(value);
  const save = page.getByRole("button", { name: "Save" });
  await expect(save).toBeEnabled();
  await expect(save).toHaveAttribute("title", "Save");
}
