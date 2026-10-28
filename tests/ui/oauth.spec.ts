import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("unconfigured providers clearly require setup and cannot be clicked", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Continue with Microsoft" })).toBeDisabled();
  await expect(page.getByText("Google and Microsoft sign-in need administrator setup.", { exact: false })).toBeVisible();
});

for (const theme of ["light", "dark"]) {
  test(`${theme}: driver profile exposes connected accounts with accessible contrast`, async ({ page, context }) => {
    await page.addInitScript(value => localStorage.setItem("tranzora-theme", value), theme);
    const login = await context.request.post("/api/auth/login", { headers: { "X-Tranzora-Request": "1" }, data: { email: "driver@demo.tranzora.test", password: "TranzoraDemo2026!" } });
    expect(login.ok()).toBeTruthy();
    await page.goto("/settings/profile");
    const panel = page.locator(".connected-accounts");
    await expect(panel.getByRole("heading", { name: "Connected sign-in accounts" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Connect Google" })).toBeDisabled();
    await expect(panel.getByRole("button", { name: "Connect Microsoft" })).toBeDisabled();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    const results = await new AxeBuilder({ page }).include(".connected-accounts").withRules(["color-contrast"]).analyze();
    expect(results.violations).toEqual([]);
    await expect(page.locator(".workspace-footer .footer-brand svg")).toBeVisible();
  });
}

test("provider enrollment fills identity fields and submits to the enrollment endpoint", async ({ page }) => {
  await page.route("**/api/auth/external/enrollment", route => route.fulfill({ json: { provider: "google", name: "OAuth Browser Test", email: "oauth-browser@example.test" } }));
  let submitted: Record<string, string> | undefined;
  await page.route("**/api/auth/external/register", async route => {
    submitted = route.request().postDataJSON();
    expect(route.request().headers()["x-tranzora-request"]).toBe("1");
    await route.fulfill({ status: 409, json: { error: "This email already has an account. Sign in with your password and connect the provider from My profile." } });
  });
  await page.goto("/register?external=google");
  await expect(page.locator('input[name="name"]')).toHaveValue("OAuth Browser Test");
  await expect(page.locator('input[name="email"]')).toHaveValue("oauth-browser@example.test");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
  await page.locator('input[name="phone"]').fill("+8801700000000");
  await page.locator('input[name="company"]').fill("OAuth Browser Workspace");
  await page.locator('input[name="password"]').fill("Browser-Integration-Test-93!");
  await page.locator('input[name="confirmPassword"]').fill("Browser-Integration-Test-93!");
  await page.locator('.terms input').check();
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await expect(page.getByText("This email already has an account.", { exact: false })).toBeVisible();
  expect(submitted?.email).toBe("oauth-browser@example.test");
});

test("an expired enrollment cannot silently create an ordinary password account", async ({ page }) => {
  await page.route("**/api/auth/external/enrollment", route => route.fulfill({ status: 400, json: { error: "Sign-up request expired." } }));
  let registered = false;
  await page.route("**/api/auth/register", route => { registered = true; return route.fulfill({ status: 500 }); });
  await page.goto("/register?external=google");
  await expect(page.getByText("Sign-up request expired.", { exact: true })).toBeVisible();
  await page.locator('input[name="name"]').fill("Expired Test");
  await page.locator('input[name="email"]').fill("expired@example.test");
  await page.locator('input[name="phone"]').fill("+8801700000000");
  await page.locator('input[name="company"]').fill("Expired Test");
  for (const name of ["password", "confirmPassword"]) await page.locator(`input[name="${name}"]`).fill("Browser-Integration-Test-93!");
  await page.locator('.terms input').check();
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await expect(page.getByText("Provider sign-up is not ready or has expired.", { exact: false })).toBeVisible();
  expect(registered).toBe(false);
});
