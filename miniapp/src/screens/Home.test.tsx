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
});
