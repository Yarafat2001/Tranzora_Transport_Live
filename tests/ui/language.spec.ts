import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const theme of ["light", "dark"]) {
 for (const width of [320,390,1440]) {
  test(`language selection ${theme} ${width}`, async ({ page, context }) => {
   await page.setViewportSize({width,height:900});
   await page.addInitScript(value=>localStorage.setItem('tranzora-theme',value),theme);
   await page.goto('/');
   const selector=page.getByRole('button',{name:'Change language',exact:true});
   await expect(selector).toBeVisible();
   await selector.click();
   await page.getByRole('menuitemradio').nth(1).click();
   await expect(page.locator('html')).toHaveAttribute('lang','bn');
   await expect(page.locator('.lp-nav a[href="/register"]')).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
   await page.reload();
   await expect(selector).toHaveAttribute('title','Language: Bengali');
   const login=await context.request.post('/api/auth/login',{headers:{'X-Tranzora-Request':'1'},data:{email:'admin@demo.tranzora.test',password:'TranzoraDemo2026!'}});
   expect(login.ok()).toBeTruthy();
   await page.goto('/customers');
   await expect(selector).toHaveAttribute('title','Language: Bengali');
   await expect(page.locator('.page-heading h1')).toHaveText('\u0997\u09cd\u09b0\u09be\u09b9\u0995 \u09ac\u09cd\u09af\u09ac\u09b8\u09cd\u09a5\u09be\u09aa\u09a8\u09be');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
   const statusFilter=page.locator('.resource-toolbar select').last();
   await expect(statusFilter.locator('option[value="Active"]')).toHaveCount(1);
   await statusFilter.selectOption('Active');
   await expect(statusFilter).toHaveValue('Active');
   const menu=page.locator(".navigation-toggle");
   await expect(menu).toBeInViewport();
   await expect(page.locator(".top-search input")).toBeInViewport();
   const bounds=await selector.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);
   const checks=await new AxeBuilder({page}).include('header.topbar').withRules(['color-contrast','select-name']).analyze();
   expect(checks.violations).toEqual([]);
   await page.screenshot({path:`TestResults/language-${theme}-${width}.png`,fullPage:true});
   await selector.click();
   await page.getByRole('menuitemradio',{name:'English',exact:true}).click();
   await expect(page.locator('.page-heading h1')).toHaveText('Customer Management');
   await expect(page.locator('html')).toHaveAttribute('lang','en');
  });
 }
}
