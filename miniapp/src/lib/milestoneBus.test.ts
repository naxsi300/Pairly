/**
 * Cluster 5 — milestoneBus regression tests.
 *
 * Bug: `useMilestoneToast` returned a fresh arrow `() => setEvent(null)` on
 *      every render. App.tsx passed that into <MilestoneToast/>, whose
 *      4-second auto-dismiss effect depended on it. Every App re-render
 *      tore down and recreated the setTimeout, so the toast never
 *      dismissed itself in practice.
 *
 * Fix: wrap the dismiss in useCallback with `[]` so its identity is stable
 *      across renders. Pin the contract here so the bug doesn't come back.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useMilestoneToast, emitMilestone } from "./milestoneBus";

describe("useMilestoneToast — cluster 5 (stable dismiss ref)", () => {
  it("returns a dismiss callback whose identity is stable across renders", () => {
    const { result, rerender } = renderHook(() => useMilestoneToast());
    const dismissA = result.current[1];
    rerender();
    const dismissB = result.current[1];
    rerender();
    const dismissC = result.current[1];
    // The whole point of the fix — without this, consumers that depend on
    // the function in a useEffect (e.g. <MilestoneToast/>'s 4s dismiss
    // timer) would re-run their effect on every render.
    expect(dismissA).toBe(dismissB);
    expect(dismissB).toBe(dismissC);
  });

  it("dismiss actually clears the event when called", () => {
    const { result } = renderHook(() => useMilestoneToast());
    act(() => {
      emitMilestone({ kind: "wishlist_count", value: 5 });
    });
    expect(result.current[0]).toEqual({ kind: "wishlist_count", value: 5 });
    act(() => {
      result.current[1]();
    });
    expect(result.current[0]).toBeNull();
  });

  it("dismiss clears the module-level lastEvent so a new hook instance returns null", () => {
    // First mount: seed a toast.
    const first = renderHook(() => useMilestoneToast());
    act(() => {
      emitMilestone({ kind: "wishlist_count", value: 7 });
    });
    expect(first.result.current[0]).toEqual({ kind: "wishlist_count", value: 7 });

    // User dismisses.
    act(() => {
      first.result.current[1]();
    });
    expect(first.result.current[0]).toBeNull();

    // Remount (HMR, navigation, etc.) — without the fix, useState's lazy
    // initializer would re-seed from the stale module-level lastEvent and
    // the toast would reappear.
    first.unmount();
    const second = renderHook(() => useMilestoneToast());
    expect(second.result.current[0]).toBeNull();
  });
});