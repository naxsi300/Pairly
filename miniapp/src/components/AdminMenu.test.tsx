/**
 * Cluster 5 — AdminMenu regression tests.
 *
 * Bug 1: the load effect had no abort/alive guard. Closing the modal mid-load
 *        would still resolve and call setState (React warning + stale UI),
 *        and a fresh open would race a stale request.
 *
 * Bug 2: only 404/403 errors set `denied`; everything else fell through to
 *        a silent "empty cards" render. Network drops, 500s, CORS errors,
 *        or a torn-down backend must surface a visible inline message.
 *
 * Bug 3: toggleSelfPro called `refresh()` after `setPro(...)`, but
 *        useIsPro.setPro already calls refetch internally — so every
 *        Pro toggle triggered two GET /api/pair/stats calls. Pin the
 *        contract: the explicit `refresh()` prop is NOT called after a
 *        successful toggle.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// Hoist the shared mock refs so the vi.mock factories can reference them.
const mocks = vi.hoisted(() => ({
  getAdminStatus: vi.fn(),
  getAdminStats: vi.fn(),
  listAdminPairs: vi.fn(),
  getAdminAudit: vi.fn(),
  togglePro: vi.fn(),
  lookupPair: vi.fn(),
  setPairPro: vi.fn(),
  getPairStats: vi.fn().mockResolvedValue({
    togetherDays: 0,
    totalWishlist: 0,
    wishlistDone: 0,
    totalGifts: 0,
    giftsCompleted: 0,
    totalQotdAnswers: 0,
    totalCountdowns: 0,
    createdAt: null,
    isPro: false,
  }),
}));

// Mock the api module so we can control which endpoints resolve / reject.
vi.mock("../sdk/api", async () => {
  const actual = await vi.importActual<typeof import("../sdk/api")>("../sdk/api");
  return {
    ...actual,
    endpoints: {
      getAdminStatus: mocks.getAdminStatus,
      getAdminStats: mocks.getAdminStats,
      listAdminPairs: mocks.listAdminPairs,
      getAdminAudit: mocks.getAdminAudit,
      togglePro: mocks.togglePro,
      lookupPair: mocks.lookupPair,
      setPairPro: mocks.setPairPro,
    },
    ApiError: actual.ApiError,
  };
});

vi.mock("../sdk/twa", () => ({
  haptic: () => {},
  isTwa: () => false,
  getInitData: () => "",
  getDevUserId: () => "",
  initTwa: () => false,
  showBackButton: () => () => {},
}));

vi.mock("../lib/useIsPro", () => ({
  useIsPro: () => ({
    isPro: false,
    setPro: vi.fn(),
    // The mock records the count so the test can assert "the explicit
    // refresh() prop is NOT called after a successful toggle".
    refresh: mocks.getPairStats,
  }),
}));

import { AdminMenu } from "./AdminMenu";

function makeStatus() {
  return {
    pairId: "p-1",
    userId: "u-1",
    tgId: 111,
    tier: "free",
    isPro: false,
    adminEnabled: true,
  };
}

function makeStats() {
  return { total: 1, pro: 0, free: 1, dissolved: 0 };
}

function makePairs() {
  return [
    {
      pairId: "p-1",
      tier: "free",
      isPro: false,
      dissolved: false,
      createdAt: null,
      members: [{ tgId: 111, name: "Alice", username: null }],
    },
  ];
}

function makeAudit() {
  return { items: [] };
}

beforeEach(() => {
  mocks.getAdminStatus.mockReset();
  mocks.getAdminStats.mockReset();
  mocks.listAdminPairs.mockReset();
  mocks.getAdminAudit.mockReset();
  mocks.togglePro.mockReset();
  mocks.lookupPair.mockReset();
  mocks.setPairPro.mockReset();
  mocks.getPairStats.mockClear();

  mocks.getAdminStatus.mockResolvedValue(makeStatus());
  mocks.getAdminStats.mockResolvedValue(makeStats());
  mocks.listAdminPairs.mockResolvedValue({ items: makePairs() });
  mocks.getAdminAudit.mockResolvedValue(makeAudit());
  mocks.togglePro.mockResolvedValue({ isPro: true });
  mocks.setPairPro.mockResolvedValue({ isPro: true });
  mocks.lookupPair.mockResolvedValue(makePairs()[0]);
});

describe("AdminMenu — cluster 5 (load effect + abort + error surfacing)", () => {
  it("threads an AbortSignal into every admin endpoint on open", async () => {
    render(
      <AdminMenu open onClose={() => {}} setPro={() => {}} refresh={() => {}} />,
    );
    await waitFor(() => {
      expect(mocks.getAdminStatus).toHaveBeenCalledTimes(1);
      expect(mocks.getAdminStats).toHaveBeenCalledTimes(1);
      expect(mocks.listAdminPairs).toHaveBeenCalledTimes(1);
      expect(mocks.getAdminAudit).toHaveBeenCalledTimes(1);
    });
    // Each call must have received an AbortSignal — not undefined — so
    // the effect cleanup can cancel in-flight requests on close.
    expect(mocks.getAdminStatus.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
    expect(mocks.getAdminStats.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
    // listAdminPairs(limit=20, offset=0, signal) — the signal is the 3rd arg.
    expect(mocks.listAdminPairs.mock.calls[0][2]).toBeInstanceOf(AbortSignal);
    // getAdminAudit(limit=15, signal) — the signal is the 2nd arg.
    expect(mocks.getAdminAudit.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
  });

  it("aborts the in-flight load when the modal is closed (no setState after unmount)", async () => {
    // Make getAdminStatus hang so we can observe the abort signal.
    let captured: AbortSignal | undefined;
    mocks.getAdminStatus.mockImplementation(
      (signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          captured = signal;
          signal.addEventListener("abort", () => {
            const err = new DOMException("aborted", "AbortError");
            reject(err);
          });
        }),
    );
    const { rerender } = render(
      <AdminMenu open onClose={() => {}} setPro={() => {}} refresh={() => {}} />,
    );
    await waitFor(() => expect(captured).toBeDefined());
    expect(captured!.aborted).toBe(false);
    // Close the modal → effect cleanup must abort.
    rerender(
      <AdminMenu open={false} onClose={() => {}} setPro={() => {}} refresh={() => {}} />,
    );
    expect(captured!.aborted).toBe(true);
  });

  it("surfaces non-404/403 errors with a visible inline message (not silent empty cards)", async () => {
    // A 500 must not silently render "Загрузка…" or an empty admin view.
    mocks.getAdminStatus.mockRejectedValueOnce(new Error("boom"));
    render(
      <AdminMenu open onClose={() => {}} setPro={() => {}} refresh={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Не удалось загрузить админ-данные/)).toBeTruthy();
      expect(screen.getByText("boom")).toBeTruthy();
    });
    // Must NOT show the "Админ-доступ не настроен" denial card for a 500.
    expect(screen.queryByText(/Админ-доступ не настроен/)).toBeNull();
  });

  it("shows the denial card on 404 (admin not configured) — kept behavior", async () => {
    const { ApiError } = await import("../sdk/api");
    mocks.getAdminStatus.mockRejectedValueOnce(new ApiError(404, "not found"));
    render(
      <AdminMenu open onClose={() => {}} setPro={() => {}} refresh={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Админ-доступ не настроен/)).toBeTruthy();
    });
  });

  it("toggleSelfPro drops the explicit refresh() call to avoid double-refetch", async () => {
    // The fix: useIsPro.setPro already calls refetch() internally. Calling
    // refresh() again in the toggle handler caused TWO pair/stats requests
    // per Pro flip. Pin that the explicit `refresh` prop is NOT invoked
    // after a successful toggle.
    const setPro = vi.fn();
    render(
      <AdminMenu open onClose={() => {}} setPro={setPro} refresh={mocks.getPairStats} />,
    );
    // Wait for the initial load to settle so the overview tab is interactive.
    await waitFor(() => {
      expect(screen.getByText(/Включить Pro/)).toBeTruthy();
    });
    mocks.getPairStats.mockClear();
    fireEvent.click(screen.getByText(/Включить Pro/));
    await waitFor(() => {
      // setPro called once with the optimistic truthy isPro.
      expect(setPro).toHaveBeenCalledWith(true);
    });
    // The mock refresh was provided as the `refresh` prop. After a
    // successful toggle, the prop `refresh` must NOT be invoked — any
    // non-zero number here proves a double-refetch slipped through.
    expect(mocks.getPairStats).not.toHaveBeenCalled();
  });
});