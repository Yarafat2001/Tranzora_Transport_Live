import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const theme of ["light", "dark"]) for (const width of [390, 1440]) {
  test(`auth actions ${theme} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(value => localStorage.setItem("tranzora-theme", value), theme);
    await page.route("**/api/auth/providers", route => route.fulfill({ json: [{provider:"google",enabled:false},{provider:"microsoft",enabled:false}] }));
    await page.goto("/login");
    await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
    await expect(page.locator(".auth-form-card").getByRole("alert")).toContainText("Google sign-in is not configured");
    await expect(page.locator(".auth-form-card").getByRole("alert")).toBeFocused();
    await expect(page.locator(".auth-form-card").getByRole("alert")).toBeInViewport();
    await page.getByRole("link", { name: "Register here", exact: true }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.locator(".auth-form-card").getByRole("alert")).toHaveCount(0);
    let submitted: Record<string, string> | undefined;
    await page.route("**/api/auth/register", async route => {
      submitted = route.request().postDataJSON();
      expect(route.request().headers()["x-tranzora-request"]).toBe("1");
      await route.fulfill({ status:503, json:{ error:"Registration service is unavailable. Please retry." } });
    });
    for (const [name,value] of Object.entries({name:"Registration Browser Check",email:"registration-browser@example.test",phone:"+8801700000000",company:"Browser Check",password:"Browser-Check-Password-93!",confirmPassword:"Browser-Check-Password-93!"}))
      await page.locator(`input[name="${name}"]`).fill(value);
    await page.locator(".terms input").check();
    await page.getByRole("button", { name:"Register",exact:true }).click();
    await expect(page.locator(".auth-form-card").getByRole("alert")).toHaveText("Registration service is unavailable. Please retry.");
    await expect(page.locator(".auth-form-card").getByRole("alert")).toBeFocused();
    await expect(page.locator(".auth-form-card").getByRole("alert")).toBeInViewport();
    expect(submitted?.company).toBe("Browser Check");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const accessibility=await new AxeBuilder({page}).include(".auth-form-card").withRules(["color-contrast","label","button-name"]).analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({path:`TestResults/auth-actions-${theme}-${width}.png`});
    await page.getByRole("link", {name:"Login here",exact:true}).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator(".auth-form-card").getByRole("alert")).toHaveCount(0);
  });
}

test("configured Google starts the provider route", async({page})=>{
  await page.route("**/api/auth/providers",route=>route.fulfill({json:[{provider:"google",enabled:true},{provider:"microsoft",enabled:false}]}));
  await page.route("**/api/auth/google",route=>route.fulfill({contentType:"text/html",body:"<p>Provider route test</p>"}));
  await page.goto("/login");
  await page.getByRole("button",{name:"Continue with Google",exact:true}).click();
  await expect(page).toHaveURL(/\/api\/auth\/google$/);
});

test("provider availability failure is distinguished from missing configuration", async({page})=>{
  await page.route("**/api/auth/providers",route=>route.fulfill({status:503,json:{error:"Unavailable"}}));
  await page.goto("/login");
  await page.getByRole("button",{name:"Continue with Google",exact:true}).click();
  await expect(page.locator(".auth-form-card").getByRole("alert")).toContainText("temporarily unavailable");
});
