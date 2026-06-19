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
      listCountdowns: vi.fn().mockResolvedValue([]),
      listWishlist: vi.fn().mockResolvedValue([
        { id: "w1", title: "Пицца", status: "open" },
        { id: "w2", title: "Кино", status: "done" },
      ]),
      getDateIdea: vi.fn().mockResolvedValue({ source: "wishlist", title: "Пицца", category: "eat" }),
    },
  };
});

describe("Home", () => {
  it("renders heading + wheel CTA + question + wishlist glance", async () => {
    render(<Home onOpen={() => {}} onOpenTab={() => {}} />);
    expect(screen.getByText("Ваш уголок")).toBeTruthy();
    expect(screen.getByText(/Крутить свидание/)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("О чём мечтаем?")).toBeTruthy();
      expect(screen.getByText(/1 хотелка в списке/)).toBeTruthy();
    });
  });
});
