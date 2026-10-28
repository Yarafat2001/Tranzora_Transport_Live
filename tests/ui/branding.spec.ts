import { test, expect } from "@playwright/test";
for (const theme of ["light", "dark"]) {
 for (const width of [390, 1440]) {
  test(`Tranzora browser icon ${theme} ${width}`, async ({ page }) => {
   await page.setViewportSize({ width, height: 900 });
   await page.addInitScript(value => localStorage.setItem("tranzora-theme", value), theme);
   await page.goto("/reset-password");
   const icon = page.locator('link[rel="icon"][type="image/svg+xml"]');
   await expect(icon).toHaveAttribute("href", /icon\.svg/);
   const result = await page.request.get((await icon.getAttribute("href"))!);
   expect(result.ok()).toBeTruthy();
   expect(await result.text()).toContain('M4 8h25v19H4zM29 14h8l7 8v5H29z');
   const apple = page.locator('link[rel="apple-touch-icon"]');
   expect((await page.request.get((await apple.getAttribute("href"))!)).ok()).toBeTruthy();
   const favicon = await page.request.get('/favicon.ico');
   expect(favicon.ok()).toBeTruthy();
   expect((await favicon.body()).readUInt16LE(2)).toBe(1);
  });
 }
}
