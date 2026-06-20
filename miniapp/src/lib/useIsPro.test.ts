import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mocks MUST be declared before importing the hook under test.
const refetch = vi.fn();
const setData = vi.fn();
vi.mock("../sdk/api", () => ({
  endpoints: {
    getPairStats: vi.fn(),
  },
  useApi: () => ({
    data: {
      isPro: false,
      togetherDays: 0,
      totalWishlist: 0,
      wishlistDone: 0,
      totalGifts: 0,
      giftsCompleted: 0,
      totalQotdAnswers: 0,
      totalCountdowns: 0,
      createdAt: null,
    },
    loading: false,
    error: null,
    refetch,
    setData,
  }),
}));

import { useIsPro } from "./useIsPro";

beforeEach(() => {
  refetch.mockReset();
  setData.mockReset();
});

describe("useIsPro — cluster 13", () => {
  it("setPro optimistically flips isPro AND refetches to confirm against server", () => {
    // setPro's docstring promises: "Optimistically flip the cached value, then
    // refetch to confirm against the server." The previous implementation only
    // setData, breaking the contract and causing stale isPro across screens.
    const { result } = renderHook(() => useIsPro());
    act(() => {
      result.current.setPro(true);
    });
    // Optimistic flip first…
    expect(setData).toHaveBeenCalledTimes(1);
    // …then refetch — the contract.
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
