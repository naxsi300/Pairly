/** Soft, one-shot celebratory toast for soft milestones. No counter, no streak, no
 * comparison — just a tiny moment when something is reached. The component
 * disappears on its own after a few seconds or on dismiss.
 *
 * For "big" milestones (anniversaries, high thresholds), adds a confetti burst.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COPY } from "../copy";
import { Confetti } from "./Confetti";

export interface MilestoneEvent {
  kind: string;
  value: number;
}

// NOTE: `together_days` is intentionally absent here. The backend still EMITS
// a `together_days` milestone (repositories/milestones.py check_together_days,
// via GET /api/pair/stats → newMilestones), but the mini-app's getPairStats
// consumer (useIsPro) only reads `isPro` and drops `newMilestones` — so the
// event never reaches this toast bus today. If a future task wires
// getPairStats.newMilestones into the bus, add a `together_days` branch here
// (or, per the universal-milestone direction, retire check_together_days on
// the backend and use the countdowns.milestonePresets flow instead).
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
  bucket_done_count: (v) =>
    v === 1 ? COPY.milestones.bucketDoneFirst
    : COPY.milestones.bucketDoneCustom(v),
};

/** Milestones that deserve a confetti burst (anniversaries + bigger achievements). */
const CONFETTI_KINDS = new Set(["gift_completed_count", "bucket_done_count"]);

export function MilestoneToast({
  events,
  onDismiss,
}: {
  events: MilestoneEvent[];
  onDismiss: () => void;
}) {
  const [showConfetti, setShowConfetti] = useState(false);

  // Idempotency key: `kind|value` of the first confetti-eligible event we
  // ever see. Without this, every parent re-render that produces a fresh
  // `events` array identity would re-trigger the confetti effect (which
  // mounts a fresh <canvas> and re-bursts particles). Now confetti only
  // fires for a milestone the user hasn't seen yet.
  const firedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const confettiEvent = events.find((e) => CONFETTI_KINDS.has(e.kind));
    if (!confettiEvent) return;
    const key = `${confettiEvent.kind}|${confettiEvent.value}`;
    if (firedKeyRef.current === key) return; // already burst for this milestone
    firedKeyRef.current = key;
    setShowConfetti(true);
  }, [events]);

  // Auto-dismiss after 4s. We keep the timer in a ref and reset it only
  // when the underlying milestone events actually change — not on every
  // parent render — so the toast always disappears 4s after it appears.
  // Previously the effect depended on `onDismiss` directly; if App.tsx
  // re-rendered and produced a new function reference, the timer would
  // be torn down and recreated, effectively extending the visible time
  // indefinitely.
  const dismissTimerRef = useRef<number | null>(null);
  const firstEventKey = events[0] ? `${events[0].kind}|${events[0].value}` : null;
  useEffect(() => {
    if (!firstEventKey) return;
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
    }
    dismissTimerRef.current = window.setTimeout(() => {
      onDismiss();
      dismissTimerRef.current = null;
    }, 4000);
    return () => {
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstEventKey]);

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
        <div className="toast">
          {events.map((e, i) => (
            <p key={`${e.kind}|${e.value}|${i}`} className="card-sub">
              {KIND_LABEL[e.kind]?.(e.value) ?? COPY.milestones.generic}
            </p>
          ))}
        </div>
      </div>
    </>
  );
}
