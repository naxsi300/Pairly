/**
 * Cluster 5 — main.tsx service-worker update wiring regression tests.
 *
 * Bug: main.tsx called `registerSW({ immediate: true })` without keeping
 *      the returned updater, so long-lived Telegram Mini App sessions
 *      never picked up new bundles until the user manually reloaded.
 *      It also had no `onRegisterError` so registration failures (storage
 *      quota, insecure context, …) were silently swallowed.
 *
 * Fix: capture the updater, poll every 15 min, trigger on visibilitychange,
 *      surface registration errors, clean up listeners on pagehide.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted so the vi.mock factory can reach it without TDZ errors.
const h = vi.hoisted(() => {
  return { updateSW: vi.fn(), registerSW: vi.fn() };
});

// Mock the virtual:pwa-register module so main.tsx's import resolves.
vi.mock("virtual:pwa-register", () => ({
  registerSW: h.registerSW.mockReturnValue(h.updateSW),
}));

beforeEach(() => {
  vi.useFakeTimers();
  h.updateSW.mockReset();
  h.updateSW.mockResolvedValue(undefined);
  h.registerSW.mockReset();
  h.registerSW.mockReturnValue(h.updateSW);
});

afterEach(() => {
  // Detach the listeners + interval the previous test's main.tsx attach —
  // pagehide is what main.tsx's cleanup is wired to.
  window.dispatchEvent(new Event("pagehide"));
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.documentElement.innerHTML = "";
  document.body.innerHTML = "";
});

// Each test re-imports main.tsx to start with a fresh window state.
async function loadMain() {
  vi.resetModules();
  // Provide #root BEFORE main.tsx runs, otherwise the throw "#root not found"
  // aborts the whole module — and so do our setInterval/visibilitychange hooks.
  document.body.innerHTML = '<div id="root"></div>';
  await import("./main");
}

describe("main.tsx — cluster 5 (SW update polling + onRegisterError)", () => {
  it("polls the SW updater every 15 minutes", async () => {
    await loadMain();
    expect(h.updateSW).not.toHaveBeenCalled();
    // 15 min = 900_000 ms
    await vi.advanceTimersByTimeAsync(900_000);
    expect(h.updateSW).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(900_000);
    expect(h.updateSW).toHaveBeenCalledTimes(2);
  });

  it("calls updateSW(true) when the document becomes visible again", async () => {
    await loadMain();
    h.updateSW.mockClear();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(h.updateSW).toHaveBeenCalledTimes(1);
    expect(h.updateSW).toHaveBeenCalledWith(true);

    // Going hidden must NOT trigger an update check.
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(h.updateSW).toHaveBeenCalledTimes(1);
  });

  it("registers onRegisterError so SW failures don't fail silently", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await loadMain();
    expect(h.registerSW).toHaveBeenCalledTimes(1);
    const opts = h.registerSW.mock.calls[0][0] as {
      immediate?: boolean;
      onRegisterError?: (e: unknown) => void;
    };
    expect(opts.immediate).toBe(true);
    expect(typeof opts.onRegisterError).toBe("function");
    // Exercise the callback — production logs the error instead of swallowing it.
    opts.onRegisterError?.(new Error("quota"));
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("cleans up the interval and visibility listener on pagehide", async () => {
    await loadMain();
    h.updateSW.mockClear();

    window.dispatchEvent(new Event("pagehide"));

    // After pagehide, no further visibility-flip should call updateSW.
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(h.updateSW).not.toHaveBeenCalled();

    // And the interval should also be cleared: advancing past 15 min must
    // not call updateSW anymore.
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(h.updateSW).not.toHaveBeenCalled();
  });
});