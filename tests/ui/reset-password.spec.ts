import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const theme of ["light", "dark"]) {
  for (const width of [390, 1440]) {
    test(`reset password ${theme} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(value => localStorage.setItem("tranzora-theme", value), theme);
      await page.goto("/reset-password?token=layout-check-invalid");
      await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
      const card = page.locator(".auth-form-card");
      const bounds = await card.boundingBox();
      expect(bounds).not.toBeNull();
      expect(Math.abs(bounds!.x + bounds!.width / 2 - width / 2)).toBeLessThan(3);
      expect(bounds!.x).toBeGreaterThanOrEqual(16);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await expect(page.getByRole("link", { name: "Back to sign in" })).toHaveCSS("text-decoration-line", "underline");
      await page.getByLabel("New password", { exact: true }).fill("Layout-Check-123!");
      await page.getByLabel("Confirm password", { exact: true }).fill("Different-Check-123!");
      await page.getByRole("button", { name: "Reset password", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Passwords do not match.");
      const accessibility = await new AxeBuilder({ page }).withRules(["color-contrast", "label"]).analyze();
      expect(accessibility.violations).toEqual([]);
      await page.screenshot({ path: `TestResults/browser/reset-${theme}-${width}.png`, fullPage: true });
    });
  }
}
