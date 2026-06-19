import { useState } from "react";
import { COPY } from "../copy";
import { endpoints, type DateIdeaResponse } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { Modal } from "./Modal";

type Phase = "idle" | "spinning" | "result";

/** Date-wheel modal: taps a warm CTA, calls the backend, shows the idea. */
export function DateWheel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [idea, setIdea] = useState<DateIdeaResponse | null>(null);

  async function spin() {
    setPhase("spinning");
    haptic("light");
    try {
      const result = await endpoints.getDateIdea();
      setIdea(result);
      setPhase("result");
      haptic("success");
    } catch {
      setPhase("idle");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="🎡 Колесо свиданий">
      <div className="rw-hero-warm flex flex-col items-center gap-4 py-4 text-center">
        {phase === "result" && idea ? (
          <>
            <p className="rw-heading">{idea.title}</p>
            <p className="rw-sub">
              {idea.source === "wishlist" ? "Из вашего списка желаний" : "Просто идея на сейчас"}
            </p>
            <button type="button" className="rw-btn-ghost" onClick={spin}>
              🔄 Ещё раз
            </button>
          </>
        ) : (
          <>
            <p className="rw-sub">{COPY.home.wheelSub}</p>
            <button
              type="button"
              className="rw-btn-warm"
              onClick={spin}
              disabled={phase === "spinning"}
            >
              {phase === "spinning" ? "Кручу…" : COPY.home.wheelCta}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
