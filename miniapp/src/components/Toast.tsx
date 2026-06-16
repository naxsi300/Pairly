/** Soft, one-shot celebratory toast for soft milestones. No counter, no streak, no
 * comparison — just a tiny moment when something is reached. The component
 * disappears on its own after a few seconds or on dismiss.
 */
import { useEffect } from "react";
import { COPY } from "../copy";

export interface MilestoneEvent {
  kind: string; // "wishlist_count" | "countdown_count" | "qotd_count" | "gift_count"
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
};

export function MilestoneToast({
  events,
  onDismiss,
}: {
  events: MilestoneEvent[];
  onDismiss: () => void;
}) {
  // Auto-dismiss after 3.5s.
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);
  if (events.length === 0) return null;
  return (
    <div
      className="fixed inset-x-0 top-2 z-50 mx-auto max-w-md px-3 animate-fade-in"
      role="status"
      aria-live="polite"
    >
      <div className="rounded-2xl bg-tg-button/95 px-4 py-3 text-tg-buttonText shadow-glow backdrop-blur">
        {events.map((e, i) => (
          <p key={i} className="text-sm font-medium">
            {KIND_LABEL[e.kind]?.(e.value) ?? COPY.milestones.generic}
          </p>
        ))}
      </div>
    </div>
  );
}
