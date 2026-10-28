import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui", workers: 1, timeout: 120000,
  expect: { timeout: 20000 }, reporter: "list", outputDir: "TestResults/browser",
  use: { baseURL: process.env.TEST_WEB_URL ?? "http://localhost:3001", channel: "chrome", headless: true,
    viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", screenshot: "only-on-failure", trace: "retain-on-failure" },
});
