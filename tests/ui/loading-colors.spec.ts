import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { renderedContrast } from "./rendered-contrast";

for (const theme of ["light", "dark"]) {
  test(`${theme}: loading, saving, disabled and error states remain readable`, async ({
    page,
    context,
  }) => {
    test.setTimeout(180000);
    await page.addInitScript(
      (value) => localStorage.setItem("tranzora-theme", value),
      theme,
    );
    const login = await context.request.post("/api/auth/login", {
      headers: { "X-Tranzora-Request": "1" },
      data: {
        email: "admin@demo.tranzora.test",
        password: "TranzoraDemo2026!",
      },
    });
    expect(login.ok()).toBeTruthy();
    let releaseProfile!: () => void;
    const profileGate = new Promise<void>((resolve) => {
      releaseProfile = resolve;
    });
    await page.route("**/api/v1/profile", async (route) => {
      if (route.request().method() === "GET") await profileGate;
      await route.continue();
    });
    try {
      await page.goto("/settings/profile");
      await expect(page.getByRole("status").filter({ hasText: "Loading account details" })).toContainText("Loading account details",
      );
      await expect(
        page.getByRole("button", { name: "Save changes", exact: true }),
      ).toBeDisabled();
      expect(await renderedContrast(page)).toEqual([]);
      await page.screenshot({
        path: `TestResults/contrast/loading-${theme}.png`,
        fullPage: true,
      });
    } finally {
      releaseProfile();
    }
    await expect(
      page.getByRole("textbox", { name: "Full name", exact: true }),
    ).not.toHaveValue("");
    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    await page.unroute("**/api/v1/profile");
    await page.route("**/api/v1/profile", async (route) => {
      if (route.request().method() === "PUT") await saveGate;
      await route.continue();
    });
    try {
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      const saving = page.getByRole("button", { name: "Saving…", exact: true });
      await expect(saving).toBeDisabled();
      await expect(saving).toHaveAttribute("aria-busy", "true");
      expect(await renderedContrast(page)).toEqual([]);
    } finally {
      releaseSave();
    }
    await expect(page.getByRole("status").filter({ hasText: "Saved successfully" })).toContainText("Saved successfully");
    await page.unroute("**/api/v1/profile");
    let releaseRecords!: () => void;
    const recordsGate = new Promise<void>((resolve) => {
      releaseRecords = resolve;
    });
    await page.route("**/api/v1/customers?**", async (route) => {
      await recordsGate;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "Records are temporarily unavailable. Please refresh to retry.",
        }),
      });
    });
    try {
      await page.goto("/customers");
      await expect(page.getByRole("status").filter({ hasText: "Loading records" })).toContainText("Loading records");
      expect(await renderedContrast(page)).toEqual([]);
    } finally {
      releaseRecords();
    }
    await expect(
      page.locator(".workspace-shell").getByRole("alert"),
    ).toContainText("temporarily unavailable");
    expect(await renderedContrast(page)).toEqual([]);
    expect(
      (await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: `TestResults/contrast/error-${theme}.png`,
      fullPage: true,
    });
  });
}
