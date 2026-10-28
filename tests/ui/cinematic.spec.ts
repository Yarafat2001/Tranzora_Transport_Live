import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
for (const theme of ['light','dark']) for (const width of [390,1440]) {
 test(`cinematic landing ${theme} ${width}`,async({page})=>{
  await page.setViewportSize({width,height:1000});
  await page.addInitScript(value=>localStorage.setItem('tranzora-theme',value),theme);
  await page.goto('/');
  await expect(page.locator('.lp-digital-map')).toBeVisible();
  await expect(page.getByText('Illustrative interface / not live telemetry')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  const trigger=page.getByRole('button',{name:'Change language',exact:true});
  await trigger.click();
  const menuBounds=await page.getByRole('menu').boundingBox();
  expect(menuBounds!.x).toBeGreaterThanOrEqual(7);
  expect(menuBounds!.x+menuBounds!.width).toBeLessThanOrEqual(width-7);
  await expect(page.getByRole('menuitemradio',{name:'English',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitemradio').nth(1)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await trigger.click();
  await page.locator('.lp-hero h1').click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  const results=await new AxeBuilder({page}).include('.lp-nav').include('.lp-hero-copy').withRules(['color-contrast','button-name']).analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({path:`TestResults/cinematic-${theme}-${width}.png`,fullPage:true});
 });
}
