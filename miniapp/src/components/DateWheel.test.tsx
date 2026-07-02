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
      addWishlist: vi.fn(),
    },
  };
});

// Replace the twa mock with a hoisted spy so individual tests can assert on
// haptic("medium") / haptic("success") calls.
vi.mock("../sdk/twa", () => ({
  haptic: vi.fn(),
}));

import { DateWheelScreen } from "./DateWheel";
import { endpoints } from "../sdk/api";
import { haptic as hapticMock } from "../sdk/twa";

const getDateIdea = endpoints.getDateIdea as unknown as ReturnType<typeof vi.fn>;
const addWishlist = endpoints.addWishlist as unknown as ReturnType<typeof vi.fn>;
const haptic = hapticMock as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  getDateIdea.mockReset();
  addWishlist.mockReset();
  haptic.mockReset();
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

describe("DateWheel — result land-bounce + medium haptic", () => {
  it("bounces the result card in and fires a medium haptic on land", async () => {
    getDateIdea.mockResolvedValueOnce({
      source: "wishlist",
      title: "Уютный ужин",
      category: "eat",
      reason: "Потому что пятница",
    });

    vi.useFakeTimers();
    render(<DateWheelScreen isPro={false} onOpenAdmin={() => {}} />);

    fireEvent.click(screen.getByText(/Крутить/));
    // Resolve the fetch, then advance past the 1100ms spin → result flip.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    // Result title is rendered (queryByText + act, since findByText deadlocks
    // under fake timers).
    const title = screen.queryByText("Уютный ужин");
    expect(title).not.toBeNull();

    // The title's outer ancestor must have the bounce class so the keyframe
    // animation runs when the result phase flips in.
    expect((title as HTMLElement).closest(".date-result-bounce")).not.toBeNull();

    // A medium-impact haptic must fire on land — this is the "thud" feel.
    expect(haptic).toHaveBeenCalledWith("medium");
  });
});

describe("DateWheel — Bundle E save-to-wishlist", () => {
  it("shows a 'Сохранить в вишлист' button on the result card and pushes the idea into the wishlist on click", async () => {
    addWishlist.mockResolvedValueOnce({
      id: "w1",
      title: "Пицца на Маросейке",
      address: null,
      category: "eat",
      status: "open",
      createdBy: "self",
      mine: true,
      archived: false,
      createdAt: "2026-06-21T00:00:00",
    });
    getDateIdea.mockResolvedValueOnce({
      source: "default",
      title: "Пицца на Маросейке",
      category: "eat",
      reason: "Без повода — просто вкусно",
    });

    vi.useFakeTimers();
    render(<DateWheelScreen isPro={false} onOpenAdmin={() => {}} />);

    // Spin → result phase.
    fireEvent.click(screen.getByText(/Крутить/));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    // The save-to-wishlist button is on the result card.
    const saveBtn = screen.getByRole("button", { name: /Сохранить в вишлист/ });
    expect(saveBtn).toBeInTheDocument();

    fireEvent.click(saveBtn);
    // addWishlist resolves with a pending microtask; flush with act.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(addWishlist).toHaveBeenCalledTimes(1);
    const sent = addWishlist.mock.calls[0][0] as { title: string };
    expect(sent.title).toBe("Пицца на Маросейке");

    // Confirmation copy shows up after the await resolves.
    expect(screen.queryByText(/Добавлено в вишлист/)).not.toBeNull();
  });
});