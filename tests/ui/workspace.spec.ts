import { test, expect } from "@playwright/test";
import { getVisibleNavigation, roleNames, getRoleHome } from "../../lib/roles";
const emails = ["superadmin", "admin", "manager", "accountant", "dispatcher", "driver", "support", "viewer"];

test("driver sign-in, full profile, sidebar, and mobile drawer", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email Address", exact: true }).fill("driver@demo.tranzora.test");
  await page.locator('input[name="password"]').fill("TranzoraDemo2026!");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.getByRole("link", { name: "Continue to dashboard" }).click();
  await expect(page).toHaveURL(/\/driver$/);
  await expect(page.getByRole("heading", { name: /Good to see you/ })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link")).toHaveCount(5);
  await nav.getByRole("link", { name: "My profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My profile", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Full name", exact: true })).toHaveValue("Demo Driver");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved successfully");
  await page.screenshot({ path: "TestResults/driver-profile-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.screenshot({ path: "TestResults/driver-profile-dark.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(nav.getByRole("link", { name: "My trips", exact: true })).toBeVisible();
  await page.screenshot({ path: "TestResults/driver-navigation-mobile.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeFocused();
  const dimensions = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});

for (const [index, role] of roleNames.entries()) {
  test(`${role}: every sidebar destination opens within the shared shell`, async ({ page, context }) => {
    const login = await context.request.post("/api/auth/login", { headers: { "X-Tranzora-Request": "1" }, data: { email: `${emails[index]}@demo.tranzora.test`, password: "TranzoraDemo2026!" } });
    expect(login.ok(), await login.text()).toBeTruthy();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const navigation = getVisibleNavigation(role);
    expect(navigation.length).toBeGreaterThan(1);
    for (const item of navigation) {
      await page.goto(item.href);
      await expect(page).toHaveURL(new RegExp(`${item.href.replaceAll("/", "\\/")}$`));
      await expect(page.locator(".workspace-shell")).toBeVisible();
      await expect(page.locator(".page-heading h1")).toBeVisible();
      const nav = page.getByRole("navigation", { name: "Main navigation" });
      await expect(nav.getByRole("link", { name: item.label, exact: true })).toHaveAttribute("aria-current", "page");
      await expect(page.locator('.workspace-shell [role="alert"]')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
    if (role === "Driver") {
      await page.goto("/users");
      await expect(page).toHaveURL(new RegExp(`${getRoleHome(role)}$`));
    }
  });
}
