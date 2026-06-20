/**
 * Tests for the useApi <-> AbortSignal wiring.
 *
 * Bug: useApi created an AbortController and aborted on cleanup, but never
 * passed the signal to the fetcher (which was zero-arg), so the network
 * request kept running after unmount. These tests pin the contract:
 *   1. The fetcher receives an AbortSignal.
 *   2. Endpoint helpers forward an optional signal into `request(...)`.
 *   3. Unmounting aborts the in-flight fetch via the same signal.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Spy on mockFetch so we can see the init object the endpoint helpers hand
// to the (mock) network layer. VITE_USE_MOCK defaults to true in tests, so
// api.ts routes requests through mockFetch rather than window.fetch.
const mockFetchSpy = vi.fn().mockResolvedValue(
  new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
);
vi.mock("../sdk/mock", async () => {
  const actual = await vi.importActual<typeof import("../sdk/mock")>("../sdk/mock");
  return { ...actual, mockFetch: mockFetchSpy };
});

// Suppress haptic calls in screens that pull in twa via side-effects.
vi.mock("../sdk/twa", () => ({
  haptic: () => {},
  isTwa: () => false,
  getInitData: () => "",
  getDevUserId: () => "",
  initTwa: () => false,
  showBackButton: () => () => {},
}));

// Imported AFTER the mock is registered.
const { useApi, request, endpoints } = await import("./api");

describe("useApi signal wiring", () => {
  beforeEach(() => {
    mockFetchSpy.mockClear();
    mockFetchSpy.mockResolvedValue(
      new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
    );
  });

  it("passes an AbortSignal to the fetcher on mount", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    renderHook(() => useApi(fetcher));
    expect(fetcher).toHaveBeenCalledTimes(1);
    const arg = fetcher.mock.calls[0][0];
    expect(arg).toBeInstanceOf(AbortSignal);
  });

  it("aborts the in-flight fetch on unmount via the same signal", async () => {
    let captured: AbortSignal | undefined;
    const fetcher = vi.fn().mockImplementation((signal: AbortSignal) => {
      captured = signal;
      return new Promise(() => {
        /* never resolves; we just want to observe the abort */
      });
    });
    const { unmount } = renderHook(() => useApi(fetcher));
    expect(captured).toBeDefined();
    expect(captured!.aborted).toBe(false);
    unmount();
    expect(captured!.aborted).toBe(true);
  });

  it("uses a fresh signal on each refetch; older one is aborted on cleanup", async () => {
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn().mockImplementation((signal: AbortSignal) => {
      signals.push(signal);
      return Promise.resolve(1);
    });
    const { result } = renderHook(() => useApi(fetcher));
    await vi.waitFor(() => expect(signals.length).toBe(1));
    result.current.refetch();
    await vi.waitFor(() => expect(signals.length).toBe(2));
    expect(signals[0]).not.toBe(signals[1]);
    // The previous run's effect cleanup aborts its own signal.
    expect(signals[0].aborted).toBe(true);
    // The latest signal stays live until the next cleanup.
    expect(signals[1].aborted).toBe(false);
  });
});

describe("endpoint helpers forward an optional signal", () => {
  beforeEach(() => {
    mockFetchSpy.mockClear();
    mockFetchSpy.mockResolvedValue(
      new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
    );
  });

  it("listWishlist forwards an AbortSignal to (mock) fetch via request(...)", async () => {
    const ctrl = new AbortController();
    await endpoints.listWishlist(ctrl.signal);
    expect(mockFetchSpy).toHaveBeenCalledTimes(1);
    const init = mockFetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(ctrl.signal);
  });

  it("getPairStats forwards an AbortSignal to (mock) fetch via request(...)", async () => {
    const ctrl = new AbortController();
    await endpoints.getPairStats(ctrl.signal);
    expect(mockFetchSpy).toHaveBeenCalledTimes(1);
    const init = mockFetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(ctrl.signal);
  });

  it("works without a signal (back-compat for callers that pass none)", async () => {
    await endpoints.listWishlist();
    expect(mockFetchSpy).toHaveBeenCalledTimes(1);
    const init = mockFetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeUndefined();
  });

  it("request() accepts a signal and passes it through", async () => {
    const ctrl = new AbortController();
    await request<string>("/api/ping", { signal: ctrl.signal });
    expect(mockFetchSpy).toHaveBeenCalledTimes(1);
    const init = mockFetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(ctrl.signal);
  });
});