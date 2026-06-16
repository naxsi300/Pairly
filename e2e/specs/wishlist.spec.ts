import { test, expect } from "@playwright/test";
import { COPY, LIMITS } from "../lib/copy";

/**
 * Wishlist smoke (mock): add an item, mark-done flips status, limit-hit banner shows.
 *
 * MOCK-ONLY. The real /api/wishlist + /api/mark-done exist in the backend, but the
 * Mini App runs against the client-side mock (miniapp/src/sdk/mock.ts) which seeds
 * 3 items. The limit banner is reached by adding items up to the cap.
 */
test.describe("Wishlist", () => {
  test("add an item -> it appears in the list -> mark-done flips it to done", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: COPY.wishlist.heading })).toBeVisible();

    // Open the add modal.
    await page.getByRole("button", { name: new RegExp(COPY.common.add) }).first().click();

    // Fill the title (the only required field) and save.
    const title = `E2E item ${Date.now()}`;
    await page.getByPlaceholder(COPY.wishlist.titlePlaceholder).fill(title);
    await page.getByRole("button", { name: COPY.common.save }).click();

    // The new item appears at the top of the list.
    const itemCard = page.locator("li", { hasText: title });
    await expect(itemCard).toBeVisible();

    // Mark it done -> the card shows the "✅ сделано" label and loses its "Сделано" button.
    await itemCard.getByRole("button", { name: /Сделано/ }).click();
    await expect(itemCard.getByText(/✅ сделано/)).toBeVisible();
    await expect(itemCard.getByRole("button", { name: /Сделано/ })).toHaveCount(0);
  });

  test("at the free-tier cap the limit-hit banner appears", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: COPY.wishlist.heading })).toBeVisible();

    // The mock seeds 3 items; the cap is LIMITS.wishlist (10). Add until at the cap.
    // We stop adding once the limit banner is visible (the Add button also gets
    // disabled, but we key the assertion on the banner copy).
    let added = 0;
    while (
      (await page.getByText(COPY.wishlist.limitHit).count()) === 0 &&
      added < LIMITS.wishlist + 2
    ) {
      const addBtn = page
        .getByRole("button", { name: new RegExp(`^\\+ ${COPY.common.add}$`) })
        .first();
      // Add button is disabled at the cap; if so, we're done.
      if (await addBtn.isDisabled()) break;

      await addBtn.click();
      const title = `Fill ${added}-${Date.now()}`;
      await page.getByPlaceholder(COPY.wishlist.titlePlaceholder).fill(title);
      await page.getByRole("button", { name: COPY.common.save }).click();
      // Wait for the item to render before the next iteration.
      await expect(page.locator("li", { hasText: title })).toBeVisible();
      added += 1;
    }

    // The warm limit-hit banner is shown with the upgrade + delete-old actions.
    await expect(page.getByText(COPY.wishlist.limitHit)).toBeVisible();
    await expect(page.getByRole("button", { name: COPY.wishlist.upgradePro })).toBeVisible();
    await expect(page.getByRole("button", { name: COPY.wishlist.deleteOld })).toBeVisible();
  });
});
