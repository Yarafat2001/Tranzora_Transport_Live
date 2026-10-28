import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

for (const theme of ["light", "dark"]) {
  test(`${theme}: glass header and record view, edit, delete controls`, async ({
    page,
    context,
  }) => {
    const login = await context.request.post("/api/auth/login", {
      headers: { "X-Tranzora-Request": "1" },
      data: {
        email: "admin@demo.tranzora.test",
        password: "TranzoraDemo2026!",
      },
    });
    expect(login.ok()).toBeTruthy();
    await page.addInitScript(
      (value) => localStorage.setItem("tranzora-theme", value),
      theme,
    );
    const suffix = randomUUID().slice(0, 8);
    const name = `UI controls ${suffix}`;
    const headers = {
      "X-Tranzora-Request": "1",
      "Idempotency-Key": randomUUID(),
    };
    const created = await context.request.post("/api/v1/customers", {
      headers,
      data: {
        name,
        reference: `UI-${suffix}`,
        status: "Active",
        email: "ui-check@example.test",
        phone: "+8801700000999",
        address: "Dhaka",
        notes: "Temporary browser verification",
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const record = await created.json();
    try {
      await page.goto("/customers");
      const search = page.getByRole("textbox", {
        name: "Search workspace",
        exact: true,
      });
      await search.fill(name);
      const row = page.getByRole("row").filter({ hasText: name });
      await expect(row).toBeVisible();
      await expect(page.locator(".topbar")).toHaveCSS(
        "backdrop-filter",
        "blur(32px) saturate(1.6)",
      );
      const edit = row.getByRole("button", {
        name: `Edit ${name}`,
        exact: true,
      });
      await edit.hover();
      await expect(edit.locator(".action-tooltip")).toBeVisible();
      await page.screenshot({
        path: `TestResults/records-${theme}.png`,
        fullPage: true,
      });
      await edit.click();
      await expect(page.locator(".record-editor h2")).toContainText("Edit");
      await page
        .getByRole("textbox", { name: /^Name/ })
        .fill(`${name} updated`);
      await page
        .getByRole("textbox", { name: "Notes", exact: true })
        .fill("Verified edit form");
      await page.screenshot({
        path: `TestResults/record-edit-${theme}.png`,
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Save record", exact: true })
        .click();
      await expect(page.locator(".record-editor")).toHaveCount(0);
      await row
        .getByRole("link", { name: `View ${name} updated`, exact: true })
        .click();
      await expect(page.locator(".record-detail h2")).toHaveText(
        `${name} updated`,
      );
      await expect(page.locator(".record-detail")).toContainText(
        "Verified edit form",
      );
      await page
        .getByRole("link", { name: "Back to list", exact: true })
        .click();
      await search.fill(name);
      await row
        .getByRole("button", { name: `Delete ${name} updated`, exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "Delete this record?" });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Cancel", exact: true }),
      ).toBeFocused();
      await page.screenshot({ path: `TestResults/record-delete-${theme}.png` });
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await row
        .getByRole("button", { name: `Delete ${name} updated`, exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Delete record", exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
      await expect(row).toHaveCount(0);
      await search.fill("");
      await expect(
        page.locator(".resource-table-scroll td").first(),
      ).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator(".resource-table-scroll td").first()).toHaveCSS(
        "white-space",
        "nowrap",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await page.screenshot({
        path: `TestResults/records-mobile-${theme}.png`,
        fullPage: true,
      });
    } finally {
      const current = await context.request.get(
        `/api/v1/customers/${record.id}`,
      );
      if (current.ok()) {
        const latest = await current.json();
        await context.request.delete(`/api/v1/customers/${record.id}`, {
          headers: {
            ...headers,
            "Idempotency-Key": randomUUID(),
            "If-Match": `"${latest.version}"`,
          },
        });
      }
    }
  });
}
