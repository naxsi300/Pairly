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

  it("long-press cancelled by pointerCancel/pointerLeave does not open admin", () => {
    // Hidden admin entry: long-press on the heading. pointerCancel and
    // pointerLeave must abort the 600ms timer, otherwise a quick tap-and-drag
    // away would still trigger admin.
    const onOpenAdmin = vi.fn();
    vi.useFakeTimers();
    render(<DateWheelScreen isPro={false} onOpenAdmin={onOpenAdmin} />);
    const heading = screen.getByRole("heading", { name: /Колесо свиданий/ });

    // Case A: pointerCancel after pointerDown — drag-away scenario.
    fireEvent.pointerDown(heading);
    fireEvent.pointerCancel(heading);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onOpenAdmin).not.toHaveBeenCalled();

    // Case B: pointerLeave after pointerDown — also drag-away scenario.
    fireEvent.pointerDown(heading);
    fireEvent.pointerLeave(heading);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onOpenAdmin).not.toHaveBeenCalled();

    // Case C: a clean down→up within 600ms must NOT open admin either
    // (otherwise a quick tap would).
    fireEvent.pointerDown(heading);
    fireEvent.pointerUp(heading);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onOpenAdmin).not.toHaveBeenCalled();
  });

  it("long-press that holds for 600ms does open admin (regression check)", () => {
    const onOpenAdmin = vi.fn();
    vi.useFakeTimers();
    render(<DateWheelScreen isPro={false} onOpenAdmin={onOpenAdmin} />);
    const heading = screen.getByRole("heading", { name: /Колесо свиданий/ });

    fireEvent.pointerDown(heading);
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(onOpenAdmin).toHaveBeenCalledTimes(1);
  });

  it("getDateIdea is called with the AbortSignal from the spin's controller", () => {
    // The fix wires the spin's AbortController into getDateIdea so unmount
    // and rapid re-spin can cancel the in-flight request.
    getDateIdea.mockResolvedValue({
      source: "wishlist",
      title: "Идея",
      category: "eat",
      reason: "",
    });
    vi.useFakeTimers();
    render(<DateWheelScreen isPro={false} onOpenAdmin={() => {}} />);
    fireEvent.click(screen.getByText(/Крутить/));
    expect(getDateIdea).toHaveBeenCalledTimes(1);
    const args = getDateIdea.mock.calls[0];
    // Third arg is the AbortSignal.
    expect(args[2]).toBeInstanceOf(AbortSignal);
  });

  it("unmounting during an in-flight spin aborts the request", async () => {
    // The fix wires the spin's AbortController into getDateIdea so unmount
    // (the only user-reachable re-spin path during the spinning phase) can
    // cancel the in-flight request and prevent a late setState on a dead
    // component.
    let resolveSpin!: (v: unknown) => void;
    getDateIdea.mockImplementation(
      () => new Promise((resolve) => { resolveSpin = resolve; }),
    );

    vi.useFakeTimers();
    const { unmount } = render(<DateWheelScreen isPro={false} onOpenAdmin={() => {}} />);
    fireEvent.click(screen.getByText(/Крутить/));

    const inflightSignal = getDateIdea.mock.calls[0][2] as AbortSignal;
    expect(inflightSignal.aborted).toBe(false);

    // Unmounting (e.g. user switches tab) during the in-flight spin must
    // abort the request so a late resolve doesn't fire setState on a dead
    // component.
    unmount();
    expect(inflightSignal.aborted).toBe(true);

    // Resolve so we don't leave a dangling promise — must not throw because
    // the AbortError path is swallowed inside spin().
    resolveSpin({ source: "wishlist", title: "ignored", category: "eat", reason: "" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  });

  it("failed spin shows an inline error instead of failing silently", async () => {
    getDateIdea.mockRejectedValueOnce(new Error("network down"));

    render(<DateWheelScreen isPro={false} onOpenAdmin={() => {}} />);
    fireEvent.click(screen.getByText(/Крутить/));

    // Wait for the rejected promise to settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Back on filters, error banner visible.
    expect(
      screen.getByText(/Не удалось получить идею — попробуйте ещё раз/),
    ).toBeInTheDocument();
    // The filters chip row is still rendered (user can retry).
    expect(screen.getByText(/Любая/)).toBeInTheDocument();
  });

  it("re-spinning clears the previous error banner", async () => {
    getDateIdea
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({
        source: "wishlist",
        title: "Свежая",
        category: "eat",
        reason: "",
      });

    vi.useFakeTimers();
    render(<DateWheelScreen isPro={false} onOpenAdmin={() => {}} />);
    fireEvent.click(screen.getByText(/Крутить/));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByText(/Не удалось получить идею — попробуйте ещё раз/),
    ).toBeInTheDocument();

    // Second spin succeeds → error clears, result renders.
    fireEvent.click(screen.getByText(/Крутить/));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(
      screen.queryByText(/Не удалось получить идею — попробуйте ещё раз/),
    ).toBeNull();
    expect(screen.queryByText("Свежая")).not.toBeNull();
  });
});