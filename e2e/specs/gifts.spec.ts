import { test, expect } from "@playwright/test";
import { COPY } from "../lib/copy";

/**
 * Gifts — catalog + send; decline copy is warm ("пропущен"), never cold
 * ("rejected"/"отклонён"-as-rejection).
 *
 * MOCK-ONLY. The Mini App's client-side mock (miniapp/src/sdk/mock.ts) bypasses
 * the network, so Playwright `page.route` cannot inject a "received from partner"
 * gift to drive the interactive decline path. The mock's seed has no gift in the
 * direction:"them" + status:"received" state that exposes the accept/decline
 * buttons, so we:
 *   1. Assert the catalog renders and sending a gift creates an entry (reachable).
 *   2. Assert the COLD rejection words never appear anywhere on the gifts screen,
 *      across all seeded statuses (received/claimed/complete). This guards the
 *      status-label map (miniapp/src/lib/format.ts giftStatusLabel) which today
 *      maps declined→"пропущен" and never yields "rejected"/"отклонён".
 *   3. SKIP the interactive decline-click test with a reason tied to
 *      open-decisions.md #14 (gifts endpoint is mock-only until the backend ships).
 */
test.describe("Gifts", () => {
  test("catalog renders and sending a gift creates an entry", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: COPY.nav.gifts }).click();
    await expect(page.getByRole("heading", { name: COPY.gifts.heading })).toBeVisible();

    // Open the gift picker (catalog modal) via the "🎁 Добавить" header button.
    await page
      .getByRole("button", { name: new RegExp(`🎁.*${COPY.common.add}`) })
      .click();
    await expect(page.getByText(COPY.gifts.sendPromptContains)).toBeVisible();

    // Send the first catalog gesture.
    const firstGesture = "Завтрак в постель";
    await page.getByRole("button", { name: firstGesture }).click();

    // It appears in the active list.
    const activeList = page.locator("main ul").first();
    await expect(activeList.locator("li", { hasText: firstGesture })).toBeVisible();
  });

  test("no cold rejection word appears on the gifts screen (warm copy invariant)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: COPY.nav.gifts }).click();
    await expect(page.getByRole("heading", { name: COPY.gifts.heading })).toBeVisible();

    // Across ALL seeded statuses (received/claimed/complete) and any sent gift,
    // the cold English rejection word and the Russian "отклонён" status must
    // never render. giftStatusLabel maps declined→"пропущен" by design.
    await expect(page.locator("main")).not.toContainText(/\brejected\b/i);
    await expect(page.locator("main")).not.toContainText(/отклон[ёе]н/);
  });

  // SKIPPED: the interactive decline path (click "Вежливо отказаться" → assert
  // "пропущен" appears). Requires a gift in direction:"them" + status:"received",
  // which the client-side mock cannot be coerced into (it bypasses the network, so
  // page.route can't inject one) and the backend /api/gifts endpoint does not exist
  // yet (open-decisions.md #14). Re-enable once either lands. The warm-copy guard
  // above (giftStatusLabel never yields "rejected") is the static half of this.
  test.skip("declining a received gift uses warm 'пропущен' copy", async () => {
    // placeholder — see comment above.
  });
});
