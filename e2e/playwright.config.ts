import { defineConfig, devices } from "@playwright/test";

/**
 * Pairly Mini App e2e (Playwright).
 *
 * Target: the React Mini App (miniapp/) running on the Vite dev server at
 * http://localhost:5173 with VITE_USE_MOCK=true. Mock mode is the DEFAULT so that
 * scenarios touching endpoints the backend does not yet implement (bucket, mood,
 * qotd, gifts — see docs/open-decisions.md #14) still exercise the UI against the
 * canned client-side mock (miniapp/src/sdk/mock.ts).
 *
 * Real-API scenarios live under `e2e/specs/real-api/` and are gated on
 * `E2E_RUN_REAL_API=1`; `make e2e` does NOT enable them by default.
 *
 * Run:
 *   npx playwright test                 # mock-only (default)
 *   E2E_RUN_REAL_API=1 npx playwright test   # + real-API wishlist + health
 */

const MINIAPP_URL =
  process.env.E2E_MINIAPP_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL: MINIAPP_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // The Mini App is a phone-width Telegram Mini App; force a phone viewport.
    viewport: { width: 390, height: 800 },
    locale: "ru-RU",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // `make e2e` starts the Vite dev server itself (with VITE_USE_MOCK=true) so the
  // Playwright config stays simple and doesn't assume a particular package manager.
  // Leave webServer off here; add a per-suite webServer if you prefer `npx` alone.
});
