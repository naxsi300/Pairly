/** Soft, one-shot celebratory toast for soft milestones. No counter, no streak, no
 * comparison — just a tiny moment when something is reached. The component
 * disappears on its own after a few seconds or on dismiss.
 *
 * For "big" milestones (anniversaries, high thresholds), adds a confetti burst.
 */
import { useCallback, useEffect, useState } from "react";
import { COPY } from "../copy";
import { Confetti } from "./Confetti";

export interface MilestoneEvent {
  kind: string;
  value: number;
}

const KIND_LABEL: Record<string, (v: number) => string> = {
  wishlist_count: (v) =>
    v === 5 ? COPY.milestones.wishlist5
    : v === 10 ? COPY.milestones.wishlist10
    : COPY.milestones.wishlistCustom(v),
  countdown_count: (v) =>
    v === 5 ? COPY.milestones.countdown5
    : v === 10 ? COPY.milestones.countdown10
    : COPY.milestones.countdownCustom(v),
  qotd_count: (v) =>
    v === 7 ? COPY.milestones.qotd7
    : COPY.milestones.qotdCustom(v),
  gift_count: (v) =>
    v === 3 ? COPY.milestones.gift3
    : v === 10 ? COPY.milestones.gift10
    : COPY.milestones.giftCustom(v),
  gift_completed_count: (v) =>
    v === 5 ? COPY.milestones.giftCompleted5
    : v === 15 ? COPY.milestones.giftCompleted15
    : COPY.milestones.giftCompletedCustom(v),
  mood_mutual_count: (v) =>
    v === 7 ? COPY.milestones.moodMutual7
    : COPY.milestones.moodMutualCustom(v),
  together_days: (v) =>
    v === 30 ? COPY.milestones.togetherDays30
    : v === 100 ? COPY.milestones.togetherDays100
    : v === 365 ? COPY.milestones.togetherDays365
    : COPY.milestones.togetherDaysCustom(v),
};

/** Milestones that deserve a confetti burst (anniversaries + bigger achievements). */
const CONFETTI_KINDS = new Set(["together_days", "gift_completed_count"]);

export function MilestoneToast({
  events,
  onDismiss,
}: {
  events: MilestoneEvent[];
  onDismiss: () => void;
}) {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (events.some((e) => CONFETTI_KINDS.has(e.kind))) {
      setShowConfetti(true);
    }
  }, [events]);

  // Auto-dismiss after 4s (slightly longer for confetti).
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const onConfettiDone = useCallback(() => setShowConfetti(false), []);

  if (events.length === 0) return null;

  return (
    <>
      {showConfetti ? <Confetti onDone={onConfettiDone} /> : null}
      <div
        className="fixed inset-x-0 z-50 mx-auto max-w-md px-3 animate-slide-up"
        role="status"
        aria-live="polite"
        style={{
          bottom: "calc(80px + var(--tg-safe-area-inset-bottom, env(safe-area-inset-bottom)) + 8px)",
        }}
      >
        <div
          className="rounded-full px-6 py-3 shadow-[var(--m3-elevation-3)]"
          style={{
            background: "var(--m3-surface-container-high)",
            color: "var(--m3-on-surface)",
          }}
        >
          {events.map((e, i) => (
            <p key={i} className="text-sm font-medium">
              {KIND_LABEL[e.kind]?.(e.value) ?? COPY.milestones.generic}
            </p>
          ))}
        </div>
      </div>
    </>
  );
}
