import { test, expect } from "@playwright/test";

test("sidebar collapse, keyboard search, navbar depth and mobile resize", async ({
  page,
  context,
}) => {
  const login = await context.request.post("/api/auth/login", {
    headers: { "X-Tranzora-Request": "1" },
    data: { email: "driver@demo.tranzora.test", password: "TranzoraDemo2026!" },
  });
  expect(login.ok()).toBeTruthy();
  await page.goto("/settings/profile");
  await expect(page.locator(".workspace-shell")).toHaveClass(/is-compact/);
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await expect(page.locator(".workspace-shell")).toHaveClass(/is-compact/);
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  await expect(page.locator(".workspace-shell")).not.toHaveClass(/is-compact/);
  await page.keyboard.press("Control+k");
  const search = page.getByRole("textbox", {
    name: "Search workspace",
    exact: true,
  });
  await expect(search).toBeFocused();
  await search.fill("My trips");
  await page
    .locator(".navigation-results")
    .getByRole("link", { name: "My trips", exact: true })
    .click();
  await expect(page).toHaveURL(/\/driver\/trips$/);
  await expect(
    page.getByRole("heading", { name: "Your assigned trips" }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const header = page.locator(".topbar");
  await header.hover({ position: { x: 100, y: 15 } });
  await expect
    .poll(() =>
      header.evaluate((element) => getComputedStyle(element).transform),
    )
    .not.toBe("none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      header.evaluate((element) => getComputedStyle(element).transform),
    )
    .toBe("none");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "My vehicles", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const widths = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
});
