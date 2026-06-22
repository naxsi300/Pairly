import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Home } from "./Home";

// Mock ONLY the endpoints (useApi runs for real against these mocked fns).
vi.mock("../sdk/api", async () => {
  const actual = await vi.importActual<typeof import("../sdk/api")>("../sdk/api");
  return {
    ...actual,
    endpoints: {
      getPairStats: vi.fn().mockResolvedValue({
        togetherDays: 42, totalWishlist: 3, wishlistDone: 1,
        totalGifts: 0, giftsCompleted: 0, totalQotdAnswers: 0,
        totalCountdowns: 0, createdAt: null,
      }),
      getMood: vi.fn().mockResolvedValue({ self: null, partner: null, partnerName: "Маша" }),
      getQotd: vi.fn().mockResolvedValue({
        question: { id: "q1", text: "О чём мечтаем?", category: "x" },
        myAnswer: null, partnerAnswered: false, partnerAnswer: null, partnerName: "Маша",
      }),
      listCountdowns: vi.fn().mockResolvedValue([
        // a past one-shot countdown → appears in the elapsed-time strip
        // (annual/monthly now roll forward to "Ближайший повод", not the strip)
        { id: "c1", label: "Знакомство", emoji: "💛", targetDate: new Date(Date.now() - 112 * 86_400_000).toISOString(), recurrence: null },
      ]),
      getDateIdea: vi.fn().mockResolvedValue({ source: "wishlist", title: "Пицца", category: "eat" }),
      listBucket: vi.fn().mockResolvedValue([
        { id: "b1", title: "Увидеть северное сияние", note: null, status: "dreaming" },
        { id: "b2", title: "Съездить на океан", note: null, status: "dreaming" },
        { id: "b3", title: "Старая мечта", note: null, status: "done" },
      ]),
      listGifts: vi.fn().mockResolvedValue({
        items: [
          { id: "g1", gesture: "Массаж", description: null, status: "received", direction: "them", createdAt: new Date().toISOString() },
        ],
        partnerName: "Маша",
      }),
      listLoveNotes: vi.fn().mockResolvedValue([
        { id: "n1", body: "очень личный текст", mine: false, readByRecipient: false, createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString() },
      ]),
    },
  };
});

describe("Home", () => {
  it("renders question + dynamic countdown strip + section entries", async () => {
    render(<Home onOpen={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("О чём мечтаем?")).toBeTruthy();
      // the past "Знакомство" countdown surfaces in the elapsed-time strip
      expect(screen.getByText("Знакомство")).toBeTruthy();
      expect(screen.getByText("дней назад")).toBeTruthy();
    });
    // section entries are in the feed (gifts is a destination again, not a tab)
    expect(screen.getByText("Подарки")).toBeTruthy();
  });

  it("shows live previews: a dream, a waiting gift (warm), notes count — not the note body", async () => {
    const { container } = render(<Home onOpen={() => {}} />);
    // a dream title from the open items appears
    await waitFor(() => {
      expect(screen.getByText(/Увидеть северное сияние|Съездить на океан/)).toBeTruthy();
    });
    // the waiting gift warms the card (hero-warm) and shows the gesture + "примите"
    expect(screen.getByText(/Массаж/)).toBeTruthy();
    expect(screen.getByText(/примите/)).toBeTruthy();
    // notes: count shown, body NEVER rendered on Home (privacy)
    expect(screen.queryByText("очень личный текст")).toBeNull();
    expect(screen.getByText(/новых/)).toBeTruthy();
    // the waiting gift warms the card (hero-warm surface)
    expect(container.querySelector(".hero-warm")).toBeTruthy();
  });
});
