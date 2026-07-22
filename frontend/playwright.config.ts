import { defineConfig, devices } from "@playwright/test";

// E2E harness (MOBILE_ROADMAP §4.5/§7.1): boots the real stack via ../run.sh
// (FastAPI :8787 + Vite :5173) and drives it in desktop AND mobile chromium —
// the mobile project is the PR gate for the H1 PWA work.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "bash ../run.sh",
    url: "http://127.0.0.1:5173",
    // Force tiered mode for the test server even if the operator's backend/.env
    // sets AAE_PERSONAL_MODE=1 for their own use — the tier/free-gate specs
    // assume the canonical tiered backend. (Only applies when Playwright boots
    // the server; kill a running personal-mode server before reusing one.)
    env: { AAE_PERSONAL_MODE: "" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // run.sh setsids its children; SIGTERM lets its trap kill both process
    // groups — the default SIGKILL orphans uvicorn/vite and teardown hangs
    // on their inherited stdio pipes.
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    stdout: "ignore",
    stderr: "ignore",
  },
});
