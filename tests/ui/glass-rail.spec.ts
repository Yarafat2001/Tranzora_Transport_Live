import { test, expect } from "@playwright/test";
import { renderedContrast } from "./rendered-contrast";

for (const role of ["driver", "admin"]) {
  test(`${role}: curved glass rail, readable controls and dark surfaces`, async ({
    page,
    context,
  }) => {
    const response = await context.request.post("/api/auth/login", {
      headers: { "X-Tranzora-Request": "1" },
      data: {
        email: `${role}@demo.tranzora.test`,
        password: "TranzoraDemo2026!",
      },
    });
    expect(response.ok()).toBeTruthy();
    await page.goto("/settings/profile");
    const rail = page.locator(".sidebar");
    await expect(rail).toHaveCSS("width", "88px");
    await expect
      .poll(() =>
        page
          .locator(".rail-surface")
          .evaluate((element) => getComputedStyle(element).clipPath),
      )
      .toMatch(/^path\(/);
    const active = page.locator('.sidebar nav [aria-current="page"] .nav-icon');
    await expect(active).toBeInViewport();
    await expect(page.locator(".rail-outline")).toBeVisible();
    await expect(page.locator(".rail-outline path")).toHaveAttribute(
      "d",
      /^M 32 0/,
    );
    const railBounds = await rail.boundingBox();
    const badgeBounds = await active.boundingBox();
    expect(badgeBounds!.x + badgeBounds!.width).toBeGreaterThan(
      railBounds!.x + railBounds!.width,
    );
    const icons = await page
      .locator(".sidebar nav a .icon")
      .evaluateAll((elements) => elements.map((element) => element.innerHTML));
    expect(new Set(icons).size).toBe(icons.length);
    const name = page.getByRole("textbox", { name: "Full name", exact: true });
    await expect(name).not.toHaveValue("");
    await expect(page.locator(".sidebar nav a.active")).toHaveCSS(
      "overflow",
      "visible",
    );
    expect(
      await name.evaluate((element) =>
        parseFloat(getComputedStyle(element).fontSize),
      ),
    ).toBeGreaterThanOrEqual(15);
    expect(
      await page
        .locator(".page-heading p")
        .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    await page.screenshot({
      path: `TestResults/${role}-glass-rail.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(name).toHaveCSS("color", "rgb(226, 234, 245)");
    await name.focus();
    await page.screenshot({
      path: `TestResults/${role}-glass-dark.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "My profile", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Open navigation", exact: true }),
    ).toBeFocused();
    const footer = page.locator(".workspace-footer");
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toContainText("Your next move, made simple.");
    await expect(footer.locator("span").last()).toBeVisible();
    expect(
      await footer.evaluate((element) =>
        parseFloat(getComputedStyle(element).fontSize),
      ),
    ).toBeGreaterThanOrEqual(13);
    expect(await renderedContrast(page)).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `TestResults/${role}-glass-mobile.png`,
      fullPage: true,
    });
  });
}

for (const theme of ["light", "dark"]) {
  test(`${theme}: landing footer stays readable on desktop and mobile`, async ({
    page,
  }) => {
    await page.addInitScript(
      (value) => localStorage.setItem("tranzora-theme", value),
      theme,
    );
    await page.goto("/");
    const footer = page.locator(".lp-footer");
    await footer.scrollIntoViewIfNeeded();
    for (const selector of [".lp-footer-brand p", ".lp-footer-links a"]) {
      expect(
        await footer
          .locator(selector)
          .first()
          .evaluate((element) =>
            parseFloat(getComputedStyle(element).fontSize),
          ),
      ).toBeGreaterThanOrEqual(14);
    }
    expect(await renderedContrast(page)).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    await footer.scrollIntoViewIfNeeded();
    await expect(footer.locator(".lp-copyright")).toBeVisible();
    expect(await renderedContrast(page)).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({ path: `TestResults/landing-footer-${theme}.png` });
  });
}
