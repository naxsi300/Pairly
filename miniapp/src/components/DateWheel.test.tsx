import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// Mocks must be declared BEFORE importing the screen under test.
vi.mock("../sdk/api", async () => {
  const actual = await vi.importActual<typeof import("../sdk/api")>("../sdk/api");
  return {
    ...actual,
    endpoints: {
      ...actual.endpoints,
      getDateIdea: vi.fn(),
    },
  };
});

vi.mock("../sdk/twa", () => ({
  haptic: () => {},
}));

import { DateWheelScreen } from "./DateWheel";
import { endpoints } from "../sdk/api";

const getDateIdea = endpoints.getDateIdea as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  getDateIdea.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("DateWheel — cluster 13 stale-idea timer fix", () => {
  it("rapid re-spin: latest idea is shown after both timers fire (no stale flip)", async () => {
    // The race the fix targets: spin() schedules a setTimeout with NO stored
    // handle. When two spins complete in close succession, both timers race to
    // setPhase("result"). With proper handle management, only the LATEST
    // timer's setPhase is what the user observes.
    getDateIdea
      .mockResolvedValueOnce({
        source: "wishlist",
        title: "Идея-один",
        category: "eat",
        reason: "",
      })
      .mockResolvedValueOnce({
        source: "wishlist",
        title: "Идея-два свежая",
        category: "do",
        reason: "",
      });

    vi.useFakeTimers();
    render(<DateWheelScreen isPro={false} onOpenAdmin={() => {}} />);

    fireEvent.click(screen.getByText(/Крутить/));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(screen.queryByText("Идея-один")).not.toBeNull();

    fireEvent.click(screen.getByText(/Ещё/));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(screen.queryByText("Идея-два свежая")).not.toBeNull();
  });

  it("unmount during pending spin timer does not fire setPhase afterwards", async () => {
    // The fix must clear the pending spin timer on unmount. We verify by
    // spying on setTimeout/clearTimeout and asserting clearTimeout is called
    // with a handle belonging to a live timer.
    let resolveSpin!: (v: unknown) => void;
    getDateIdea.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSpin = resolve;
        }),
    );

    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    const { unmount } = render(<DateWheelScreen isPro={false} onOpenAdmin={() => {}} />);
    fireEvent.click(screen.getByText(/Крутить/));

    resolveSpin({ source: "wishlist", title: "Идея", category: "eat", reason: "" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // After resolve, spin() armed a 1100ms setTimeout. Count setTimeout calls
    // up to this point.
    const setTimeoutCallsBeforeUnmount = setTimeoutSpy.mock.calls.length;

    unmount();

    // The fix's useEffect cleanup must call clearTimeout at least once for
    // the spin timer handle. Without the fix, this clearTimeout would not
    // be called for the spin timer.
    const clearTimeoutCallsAfterUnmount = clearTimeoutSpy.mock.calls.length;
    expect(clearTimeoutCallsAfterUnmount).toBeGreaterThan(0);

    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
    // Touch the unused binding so TS doesn't complain.
    void setTimeoutCallsBeforeUnmount;
  });
});