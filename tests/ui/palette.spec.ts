import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { renderedContrast } from "./rendered-contrast";

for (const theme of ["light", "dark"]) {
  test(`${theme}: rendered colors on glass and gradient surfaces`, async ({
    page,
    context,
  }) => {
    test.setTimeout(300000);
    await page.addInitScript(
      (value) => localStorage.setItem("tranzora-theme", value),
      theme,
    );
    const report: {
      route: string;
      failures: Awaited<ReturnType<typeof renderedContrast>>;
    }[] = [];
    for (const [role, routes] of [
      ["public", ["/", "/login", "/register", "/forgot-password"]],
      [
        "admin",
        [
          "/dashboard",
          "/customers",
          "/settings/profile",
          "/settings/security/password",
          "/users/create",
        ],
      ],
      ["driver", ["/driver", "/driver/trips"]],
    ] as const) {
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
      for (const route of routes) {
        await page.goto(route);
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
        const failures = await renderedContrast(page);
        await page.evaluate(() =>
          window.scrollTo(0, document.documentElement.scrollHeight),
        );
        failures.push(...(await renderedContrast(page)));
        await page.evaluate(() => window.scrollTo(0, 0));
        if (["/login", "/settings/profile", "/customers"].includes(route)) {
          await page.setViewportSize({ width: 390, height: 844 });
          failures.push(...(await renderedContrast(page)));
          await page.evaluate(() =>
            window.scrollTo(0, document.documentElement.scrollHeight),
          );
          failures.push(...(await renderedContrast(page)));
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: `TestResults/contrast/mobile-${theme}-${route.replaceAll("/", "_")}.png`,
            fullPage: true,
          });
          await page.setViewportSize({ width: 1440, height: 1000 });
          await page.evaluate(() => window.scrollTo(0, 0));
        }
        report.push({ route, failures });
        console.log(
          `${theme} ${route}: ${failures.length} rendered contrast failures`,
        );
        if (["/", "/customers", "/settings/profile", "/driver"].includes(route))
          await page.screenshot({
            path: `TestResults/contrast/${theme}-${role}-${route.replaceAll("/", "_")}.png`,
            fullPage: true,
          });
      }
    }
    mkdirSync("TestResults/contrast", { recursive: true });
    writeFileSync(
      `TestResults/contrast/rendered-${theme}.json`,
      JSON.stringify(report, null, 2),
    );
    if (process.env.CONTRAST_REPORT_ONLY !== "1")
      expect(
        report.flatMap((result) =>
          result.failures.map((issue) => ({ route: result.route, ...issue })),
        ),
      ).toEqual([]);
  });
}
