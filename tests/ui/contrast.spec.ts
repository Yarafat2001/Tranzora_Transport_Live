import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { getVisibleNavigation } from "../../lib/roles";

for (const theme of ["light", "dark"]) {
  for (const role of ["public", "admin", "driver"]) {
    test(`${theme} ${role}: text contrast across pages`, async ({
      page,
      context,
    }) => {
      test.setTimeout(600000);
      await page.addInitScript(
        (value) => localStorage.setItem("tranzora-theme", value),
        theme,
      );
      if (role !== "public") {
        const login = await context.request.post("/api/auth/login", {
          headers: { "X-Tranzora-Request": "1" },
          data: {
            email: `${role}@demo.tranzora.test`,
            password: "TranzoraDemo2026!",
          },
        });
        expect(login.ok()).toBeTruthy();
      }
      const routes =
        role === "public"
          ? ["/", "/login", "/register", "/forgot-password", "/reset-password"]
          : [
              ...getVisibleNavigation(
                role === "admin" ? "Business Admin" : "Driver",
              ).map((item) => item.href),
              ...(role === "admin"
                ? ["/customers/create", "/users/create"]
                : []),
            ];
      const report = [];
      for (const route of routes) {
        await page.goto(route);
        await expect(
          page
            .locator(
              role === "public" ? ".lp, .auth-page, main" : ".workspace-shell",
            )
            .first(),
        ).toBeVisible();
        if (role !== "public")
          await page.waitForFunction(
            () =>
              !document.querySelector("[data-live-workspace] .loading-state") &&
              !document
                .querySelector("[data-live-workspace]")
                ?.textContent?.match(
                  /Loading records|Loading workspace totals|Loading your account|Getting your journey ready/,
                ),
          );
        const results = await new AxeBuilder({ page })
          .withRules(["color-contrast"])
          .analyze();
        report.push({
          route,
          violations: results.violations.flatMap((item) =>
            item.nodes.map((node) => ({
              target: node.target,
              html: node.html,
              summary: node.failureSummary,
              details: node.any.map((check) => check.data),
            })),
          ),
          incomplete: results.incomplete.flatMap((item) =>
            item.nodes.map((node) => ({
              target: node.target,
              summary: node.failureSummary,
            })),
          ),
        });
        console.log(
          `${theme} ${role} ${route}: ${report.at(-1)!.violations.length} contrast failures`,
        );
      }
      mkdirSync("TestResults/contrast", { recursive: true });
      writeFileSync(
        `TestResults/contrast/${theme}-${role}.json`,
        JSON.stringify(report, null, 2),
      );
      if (process.env.CONTRAST_REPORT_ONLY !== "1")
        expect(
          report.flatMap((result) =>
            result.violations.map((issue) => ({
              route: result.route,
              ...issue,
            })),
          ),
        ).toEqual([]);
    });
  }
}
