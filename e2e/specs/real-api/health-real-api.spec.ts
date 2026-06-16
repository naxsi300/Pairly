import { test, expect } from "@playwright/test";

/**
 * REAL-API scenarios — gated on E2E_RUN_REAL_API=1.
 *
 * These hit the FastAPI backend (make api / E2E_API_URL) directly, NOT the Mini App,
 * and are OFF by default. `make e2e` runs only the mock-backed Playwright suite +
 * the in-process pytest bot tests, because:
 *   - the backend ships ONLY /api/health + /api/wishlist (+ mark-done) today
 *     (docs/open-decisions.md #14); bucket/mood/qotd/gifts are frontend-mock only.
 *   - real Telegram initData HMAC auth is still a TODO, so the API trusts headers.
 *
 * Run manually:
 *   uv run uvicorn pairly.api.app:app --port 8000 &   # in one terminal
 *   E2E_RUN_REAL_API=1 E2E_API_URL=http://localhost:8000 npx playwright test specs/real-api
 */
const RUN = process.env.E2E_RUN_REAL_API === "1";
const API_URL = process.env.E2E_API_URL ?? "http://localhost:8000";

test.describe("Real FastAPI backend", () => {
  test.skip(!RUN, "real-API suite — set E2E_RUN_REAL_API=1 to run");

  test("GET /api/health returns 200 ok", async ({ request }) => {
    const res = await request.get(`${API_URL}/api/health`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("GET /api/wishlist without pair-context headers is rejected", async ({
    request,
  }) => {
    // The endpoint requires X-Pair-Id / X-User-Id headers (stand-in auth).
    const res = await request.get(`${API_URL}/api/wishlist`);
    expect([400, 422]).toContain(res.status());
  });
});
