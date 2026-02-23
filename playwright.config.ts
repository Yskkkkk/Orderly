import { defineConfig } from "@playwright/test";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: !isCI,
  workers: isCI ? 1 : undefined,
  retries: isCI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:1420",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: isCI
      ? "pnpm build && pnpm preview:e2e"
      : "pnpm dev -- --host 127.0.0.1 --port 1420 --strictPort",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !isCI,
    timeout: isCI ? 240_000 : 120_000,
  },
});
