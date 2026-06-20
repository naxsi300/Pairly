import { useState } from "react";
import { endpoints, type DateIdeaResponse } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { Modal } from "./Modal";

type Phase = "filters" | "spinning" | "result";
type Cat = "" | "eat" | "do" | "watch" | "stay";

const CATEGORIES: { id: Cat; label: string }[] = [
  { id: "", label: "🎲 Любая" },
  { id: "eat", label: "🍜 Еда" },
  { id: "do", label: "🚶 Прогулка" },
  { id: "watch", label: "🎬 Кино" },
  { id: "stay", label: "🛌 Дом" },
];

/**
 * Date-wheel — 1:1 with the R-warm gallery: filter chips → spinning conic wheel
 * → warm result card. Calls /api/date-idea (which spins the open wishlist).
 */
export function DateWheel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("filters");
  const [cat, setCat] = useState<Cat>("");
  const [idea, setIdea] = useState<DateIdeaResponse | null>(null);

  async function spin() {
    setPhase("spinning");
    haptic("light");
    try {
      const result = await endpoints.getDateIdea(cat || undefined);
      setIdea(result);
      // Let the wheel visibly spin for a beat before revealing.
      setTimeout(() => {
        setPhase("result");
        haptic("success");
      }, 1100);
    } catch {
      setPhase("filters");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="🎡 Колесо свиданий">
      <div className="flex flex-col gap-2 py-2">
        {phase === "filters" && (
          <>
            <p className="sub">Сузим варианты под вас</p>
            <p className="section-label">Категория</p>
            <div className="chip-row">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCat(c.id)}
                  className={`chip ${cat === c.id ? "active" : ""}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <button type="button" className="btn-warm mt-2" onClick={spin}>
              🎡 Крутить! →
            </button>
          </>
        )}

        {phase === "spinning" && (
          <>
            <h1 className="heading" style={{ textAlign: "center" }}>
              Крутится…
            </h1>
            <div className="spin-pointer" />
            <div className="spin spinning" />
            <p style={{ textAlign: "center", fontSize: 14, color: "var(--tg-hint)", marginTop: 20 }}>
              Подбираем из ваших идей…
            </p>
          </>
        )}

        {phase === "result" && idea && (
          <>
            <h1 className="heading" style={{ textAlign: "center" }}>
              Выпало!
            </h1>
            <div className="hero-warm" style={{ textAlign: "center", padding: "28px 20px" }}>
              <div style={{ fontSize: 56, marginBottom: 10 }}>{ideaEmoji(idea)}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{idea.title}</div>
              <div style={{ fontSize: 14, color: "var(--tg-hint)", marginTop: 6 }}>
                {idea.source === "wishlist" ? "Из вашего списка желаний" : "Идея на сейчас"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={spin}>
                🔄 Ещё
              </button>
              <button type="button" className="btn-warm" style={{ flex: 1 }} onClick={onClose}>
                👍 Идём!
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function ideaEmoji(idea: DateIdeaResponse): string {
  const map: Record<string, string> = { eat: "🍽️", do: "🚶", watch: "🎬", stay: "🛌", buy: "🛍️" };
  return map[idea.category ?? ""] ?? "🎲";
}
