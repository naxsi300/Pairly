import { test, expect } from "@playwright/test";
import { COPY } from "../lib/copy";

/**
 * Mood sync — latest-only invariant (privacy-by-design, anti-anxiety guard).
 *
 * Source of truth: docs/flows/mood-sync.mmd "MoodSet":
 *   - Partner sees the CURRENT mood only. NO history graph, trend, score, or streak.
 *
 * MOCK-ONLY. The mock seeds self ("хорошо") + partner ("сияю") moods. We set a new
 * mood and assert the latest is shown with NO history-graph surface.
 *
 * NOTE: Playwright text/placeholder matchers mis-parse certain Cyrillic strings
 * containing parentheses (a `unicode` regex-engine error), so we drive the UI via
 * role/aria locators and the note <input> element directly rather than by its
 * placeholder text.
 */
test.describe("Mood", () => {
  test("set a mood -> latest is shown; partner sees latest-only, no history graph", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: COPY.nav.mood }).click();
    await expect(page.getByRole("heading", { name: COPY.mood.heading })).toBeVisible();

    // Pick a mood value that differs from the seeded self mood ("хорошо").
    const next = "ровно";
    await page.getByRole("button", { name: next }).click();

    // After picking, the note <input> (maxLength 60) + Save appear. Locate the
    // note input by its DOM shape rather than placeholder text.
    const noteInput = page.locator("main input[maxlength='60']");
    await expect(noteInput).toBeVisible();
    await page.getByRole("button", { name: COPY.common.save }).click();

    // The picked mood is now the pressed one.
    await expect(page.getByRole("button", { name: next })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // The partner line shows a mood (latest-only), labelled "Партнёр".
    const partnerLine = page.locator("p", { hasText: COPY.mood.partnerLabel }).first();
    await expect(partnerLine).toBeVisible();

    // NO history graph / trend surface exists. The app renders mood as plain <p>
    // text lines; assert no chart primitives leak in.
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.locator("svg")).toHaveCount(0);
    // And none of the forbidden history/trend words appear.
    for (const forbidden of ["история", "тренд", "график", "статистика", "стрик", "streak"]) {
      await expect(page.locator("body")).not.toContainText(forbidden);
    }
  });
});
