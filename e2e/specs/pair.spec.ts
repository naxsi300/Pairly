import { test, expect } from "@playwright/test";
import { COPY } from "../lib/copy";

/**
 * Smoke: the Mini App boots, tabs render, and a paired context loads.
 *
 * MOCK-ONLY (VITE_USE_MOCK=true). The Mini App has NO in-UI pair-up-first gate —
 * pairing is bot-side (`/pair`). The client always resolves a fallback pair context
 * (miniapp/src/sdk/twa.ts FALLBACK_CONTEXT), so a "paired" context is the only state
 * reachable in the browser. We assert that state here: app loads, tabs navigate,
 * each tab shows its Russian heading. A real pair-up-first gate belongs to the bot
 * e2e (e2e/bot/test_pair_flow_e2e.py); see README "mock vs real".
 */
test.describe("Mini App smoke — load + tab navigation", () => {
  test("loads, shows the mock-mode banner, and the wishlist tab by default", async ({
    page,
  }) => {
    await page.goto("/");

    // Mock-mode banner confirms VITE_USE_MOCK=true is active.
    await expect(page.getByText(COPY.app.demoBanner)).toBeVisible();

    // Default tab is wishlist; its heading renders.
    await expect(
      page.getByRole("heading", { name: COPY.wishlist.heading }),
    ).toBeVisible();
  });

  test("all four headline tabs navigate to their screens", async ({ page }) => {
    await page.goto("/");

    // Each entry: the bottom-tab label (emoji + text) and the screen heading.
    const cases: Array<[tabLabel: string, heading: string]> = [
      [COPY.nav.wishlist, COPY.wishlist.heading],
      [COPY.nav.qotd, COPY.qotd.heading],
      [COPY.nav.mood, COPY.mood.heading],
      [COPY.nav.gifts, COPY.gifts.heading],
    ];

    for (const [tabLabel, heading] of cases) {
      // The bottom-tab button text is "<emoji> <label>"; match by the label suffix.
      await page.getByRole("button", { name: tabLabel }).click();
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
  });
});
