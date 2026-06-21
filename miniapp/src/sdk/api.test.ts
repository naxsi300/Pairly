/**
 * Tests for the useApi <-> AbortSignal wiring, photo blob auth header,
 * and X-Client-Timezone header.
 *
 * Bug: useApi created an AbortController and aborted on cleanup, but never
 * passed the signal to the fetcher (which was zero-arg), so the network
 * request kept running after unmount. These tests pin the contract:
 *   1. The fetcher receives an AbortSignal.
 *   2. Endpoint helpers forward an optional signal into `request(...)`.
 *   3. Unmounting aborts the in-flight fetch via the same signal.
 *   4. (Cluster 7) request() emits X-Client-Timezone header so the server
 *      can render QOTD/wheel smart-mode in the user's local clock.
 *   5. (Cluster 7) The wishlist photo is fetched via the auth-header path
 *      (so initData never ends up in a URL/query/Caddy log) and returns a
 *      Blob that callers can wrap in a URL.createObjectURL.
 *   6. (Cluster 7) NO client-built URL contains init_data as a query param.
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
const { useApi, request, requestBlob, endpoints } = await import("./api");

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

describe("cluster 7 — X-Client-Timezone header", () => {
  beforeEach(() => {
    mockFetchSpy.mockClear();
    mockFetchSpy.mockResolvedValue(
      new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
    );
  });

  it("request() emits X-Client-Timezone on every fetch (Intl available)", async () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    await request<string>("/api/ping");
    expect(mockFetchSpy).toHaveBeenCalledTimes(1);
    const init = mockFetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Client-Timezone"]).toBeDefined();
    // Should match whatever the runtime reports (or be the empty string if
    // a host ever returns undefined — the header is always emitted).
    expect(headers["X-Client-Timezone"]).toBe(tz);
  });

  it("request() never throws when Intl.DateTimeFormat / timeZone is missing", async () => {
    // Defensive: the api guard for "Intl.DateTimeFormat().resolvedOptions()"
    // returning no timeZone must not crash a request.
    const origIntl = globalThis.Intl;
    // Replace with a stub that has no resolvedOptions().timeZone.
    (globalThis as { Intl: unknown }).Intl = {
      DateTimeFormat: () => ({ resolvedOptions: () => ({}) }),
    } as unknown as typeof Intl;
    try {
      await request<string>("/api/ping");
      expect(mockFetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as { Intl: unknown }).Intl = origIntl;
    }
  });
});

describe("cluster 7 — photo via authed blob (no init_data in URL)", () => {
  beforeEach(() => {
    mockFetchSpy.mockClear();
    // Return a small image-like payload so the blob path exercises real bytes.
    mockFetchSpy.mockResolvedValue(
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
  });

  it("requestBlob emits X-Client-Timezone, builds a clean URL (no init_data query), returns Blob", async () => {
    // requestBlob is the underlying transport — wishlistPhotoBlob delegates
    // here in non-mock mode. Pin the contract that NO client-built URL
    // ever carries initData as a query parameter (that would land in Caddy
    // access logs and Referer headers).
    const blob = await requestBlob("/api/wishlist/w-photo-1/photo");
    expect(mockFetchSpy).toHaveBeenCalledTimes(1);
    const [urlArg, initArg] = mockFetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = initArg.headers as Record<string, string>;
    // Timezone header is always emitted (cluster 7(c)).
    expect("X-Client-Timezone" in headers).toBe(true);
    // Critically: the URL the client builds MUST NOT carry init_data/query.
    expect(urlArg).not.toMatch(/init_data=/);
    expect(urlArg).not.toMatch(/dev_user_id=/);
    expect(urlArg).not.toMatch(/\?/);
    expect(urlArg).toMatch(/\/api\/wishlist\/w-photo-1\/photo$/);
    // The blob is a real Blob-like object, not a JSON object. jsdom's
    // Response.blob() returns an object with `.size` and `.type` — those
    // are the props `URL.createObjectURL` needs.
    expect(typeof (blob as { size?: number }).size).toBe("number");
    expect(typeof (blob as { type?: string }).type).toBe("string");
  });

  it("requestBlob forwards the AbortSignal to the underlying fetch", async () => {
    // We can't make the mock fetch itself reject on abort without a real
    // fetch implementation, but we can pin that the signal is passed
    // through — the contract the UI relies on (useApi passes the same
    // signal, unmount aborts it).
    const ctrl = new AbortController();
    const promise = requestBlob("/api/wishlist/w-photo-3/photo", { signal: ctrl.signal });
    // The mock fetch resolves immediately, so we await and then check
    // the captured init.
    await promise;
    expect(mockFetchSpy).toHaveBeenCalledTimes(1);
    const initArg = mockFetchSpy.mock.calls[0][1] as RequestInit;
    expect(initArg.signal).toBe(ctrl.signal);
  });

  it("wishlistPhotoBlob does not embed init_data/dev_user_id in any string URL", async () => {
    // The new endpoint helper returns a Promise<Blob> — not a URL. Pin that
    // contract: even if a future refactor re-introduces a URL string, it
    // must never carry the auth tokens.
    const fn = (endpoints as unknown as Record<string, unknown>).wishlistPhotoBlob;
    expect(typeof fn).toBe("function");
    const result = (fn as (id: string) => unknown)("w-test");
    // Must be a Promise (or thenable) — never a plain string with init_data.
    expect(typeof result).not.toBe("string");
    expect(typeof (result as { then?: unknown }).then).toBe("function");
    // The old query-param helper is GONE — pin its absence.
    expect((endpoints as unknown as Record<string, unknown>).wishlistPhotoUrl).toBeUndefined();
  });
});