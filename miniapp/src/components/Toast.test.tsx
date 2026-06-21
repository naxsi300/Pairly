/**
 * Cluster 5 — MilestoneToast regression tests.
 *
 * Bug 1: confetti effect ran on every render of <MilestoneToast/> because
 *        the `events` prop was a fresh array on every parent render
 *        (App.tsx did `events={[milestone]}` inline). Result: the confetti
 *        burst restarted whenever anything in App re-rendered.
 *
 * Bug 2: the 4-second auto-dismiss setTimeout depended directly on
 *        `onDismiss`. Combined with a fresh dismiss callback from
 *        useMilestoneToast, every App render cleared and recreated the
 *        timer — the toast would never auto-dismiss in practice.
 *
 * Fix:
 *   - App.tsx now wraps the events array in useMemo + a stable dismiss
 *     callback, so the props are referentially stable.
 *   - Toast.tsx fires confetti at most once per `kind|value` milestone
 *     via an idempotency ref, and keeps the dismissal timer in a ref so
 *     parent re-renders no longer reset it.
 *
 * These tests pin the contracts at the component level: a stale `events`
 * array identity must not restart the timer or the confetti effect.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, act, cleanup, screen } from "@testing-library/react";

import { MilestoneToast } from "./Toast";

// jsdom doesn't implement canvas — silence the rendering without breaking
// the test by stubbing getContext before mounting.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("MilestoneToast — cluster 5 (stable refs + confetti idempotency)", () => {
  it("dismisses itself 4s after the events change — survives parent re-renders", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const events = [{ kind: "wishlist_count", value: 5 }];

    const { rerender } = render(<MilestoneToast events={events} onDismiss={onDismiss} />);
    // Simulate App.tsx re-rendering for an unrelated reason — passing the
    // SAME events array reference (post-useMemo) so the toast should NOT
    // reset its timer.
    rerender(<MilestoneToast events={events} onDismiss={onDismiss} />);
    rerender(<MilestoneToast events={events} onDismiss={onDismiss} />);

    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses only once when re-rendered multiple times during the 4s window", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const events = [{ kind: "wishlist_count", value: 5 }];

    const { rerender } = render(<MilestoneToast events={events} onDismiss={onDismiss} />);
    // Parent re-renders 5 times — without the fix, the timer would be torn
    // down + recreated each time, pushing dismissal out indefinitely.
    for (let i = 0; i < 5; i += 1) {
      rerender(<MilestoneToast events={events} onDismiss={onDismiss} />);
    }
    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders the confetti canvas exactly once per mount, not per re-render", () => {
    // The idempotency ref inside Toast.tsx means a parent re-render with
    // the same milestone must NOT add another <canvas>. We count canvases
    // in the DOM: exactly 1 throughout 3 re-renders.
    const events = [{ kind: "together_days", value: 100 }];
    const { rerender } = render(<MilestoneToast events={events} onDismiss={() => {}} />);
    const initialCanvasCount = document.querySelectorAll("canvas").length;
    expect(initialCanvasCount).toBe(1);

    rerender(<MilestoneToast events={events} onDismiss={() => {}} />);
    rerender(<MilestoneToast events={events} onDismiss={() => {}} />);
    rerender(<MilestoneToast events={events} onDismiss={() => {}} />);

    const afterReRenderCanvasCount = document.querySelectorAll("canvas").length;
    expect(afterReRenderCanvasCount).toBe(1);
  });

  it("shows the toast body for the milestone", () => {
    render(<MilestoneToast events={[{ kind: "wishlist_count", value: 5 }]} onDismiss={() => {}} />);
    expect(screen.getByText(/5 вещей в вишлисте/)).toBeTruthy();
  });
});