import { test, expect } from "@playwright/test";
import { COPY } from "../lib/copy";

/**
 * QOTD — the reveal-gate invariant (HARD privacy guarantee).
 *
 * Source of truth: docs/flows/question-of-the-day.mmd "RevealGate":
 *   - If I have NOT answered today → the partner's answer is NEVER shown; the UI
 *     shows the locked "answer first" copy instead. "HARD: never let partner peek."
 *   - After I answer → my answer is shown; the partner's reveals only if they too
 *     answered (else a "waiting" copy, never their text).
 *
 * This is the load-bearing test of the whole suite. If it fails, the privacy
 * invariant is broken — do not merge a change that turns it red.
 *
 * MOCK-ONLY. NOTE on strength: the Mini App's client-side mock
 * (miniapp/src/sdk/mock.ts) bypasses the network, so Playwright `page.route`
 * cannot inject a canned partner answer. We therefore assert the invariant
 * against the gate's STRUCTURE: before I answer, the entire "answers" card
 * (which would render either my answer or the partner's) is absent and ONLY the
 * locked prompt renders; after I answer, my answer appears and the partner slot
 * shows the "waiting" copy (never a partner answer, since the mock seeds
 * partnerAnswered=false). If the `!iAnswered` guard in QuestionOfTheDay.tsx were
 * removed, the answers card would render in the locked state and this test fails.
 *
 * A canary test (planting a known partner answer and asserting pre-answer
 * absence) requires either a real backend /api/qotd or a test seam in the mock;
 * tracked as a follow-up once the QOTD endpoint lands (open-decisions.md #14).
 */
test.describe("QOTD reveal gate", () => {
  test("before I answer: NO answers card renders, only the locked prompt", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: COPY.nav.qotd }).click();
    await expect(page.getByRole("heading", { name: COPY.qotd.heading })).toBeVisible();

    // The locked copy is shown (mentions the partner name "Партнёр").
    await expect(page.getByText(COPY.qotd.revealLocked)).toBeVisible();
    // The "Ответить" (answer) affordance is present.
    await expect(page.getByRole("button", { name: COPY.qotd.answerButton })).toBeVisible();

    // THE INVARIANT: the "my answer" label and ANY partner-answer block are absent.
    // The answers card only renders when iAnswered is true; while locked it must not.
    await expect(page.getByText(COPY.qotd.myAnswerLabel)).toHaveCount(0);
    // The answer textarea (shown only inside the answering form, which is closed)
    // is also absent until the user opens it.
    await expect(page.getByPlaceholder(COPY.qotd.answerPlaceholder)).toHaveCount(0);
  });

  test("after I answer: my answer shows; partner slot shows waiting, never a partner answer", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: COPY.nav.qotd }).click();

    // Locked initially.
    await expect(page.getByText(COPY.qotd.revealLocked)).toBeVisible();

    // Open the answer form and submit.
    await page.getByRole("button", { name: COPY.qotd.answerButton }).click();
    const myAnswer = `Мой ответ ${Date.now()}`;
    await page.getByPlaceholder(COPY.qotd.answerPlaceholder).fill(myAnswer);
    await page.getByRole("button", { name: COPY.common.save }).click();

    // REVEALED STATE: my answer label + my answer text now render.
    await expect(page.getByText(COPY.qotd.myAnswerLabel)).toBeVisible();
    await expect(page.locator("body")).toContainText(myAnswer);

    // The locked prompt is GONE now.
    await expect(page.getByText(COPY.qotd.revealLocked)).toHaveCount(0);

    // The mock seeds partnerAnswered=false, so the partner slot shows the warm
    // "waiting for partner" copy — and crucially NOT a partner answer body. We
    // scan the answers card (the one containing "Твой ответ") for any «…»-quoted
    // text OTHER than my own answer; a leak would surface here.
    const answersCard = page.locator("div", { hasText: COPY.qotd.myAnswerLabel }).last();
    const cardText = await answersCard.innerText();
    const quoted = cardText.match(/«[^»]+»/g) ?? [];
    const notMine = quoted.filter((q) => q !== `«${myAnswer}»`);
    expect(
      notMine,
      "no partner answer must render in the answers card while partner hasn't answered",
    ).toHaveLength(0);
  });
});
