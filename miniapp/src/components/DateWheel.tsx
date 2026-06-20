import { useState } from "react";
import { endpoints, type DateIdeaResponse } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { Modal } from "./Modal";
import { Paywall } from "./Paywall";

type Phase = "filters" | "spinning" | "result";
type Cat = "" | "eat" | "do" | "watch" | "stay";
type Mode = "random" | "smart" | "lucky";

const CATEGORIES: { id: Cat; label: string }[] = [
  { id: "", label: "🎲 Любая" },
  { id: "eat", label: "🍜 Еда" },
  { id: "do", label: "🚶 Прогулка" },
  { id: "watch", label: "🎬 Кино" },
  { id: "stay", label: "🛌 Дом" },
];

const MODES: { id: Mode; label: string; locked: boolean }[] = [
  { id: "random", label: "🎲 Случайное", locked: false },
  { id: "smart", label: "🧠 Умный", locked: true },
  { id: "lucky", label: "🍀 Мне повезёт", locked: true },
];

/**
 * Date-wheel — 3 modes (gallery R-warm): filter chips → spinning conic wheel →
 * warm result card. Mode 1 (random, from wishlist) is free; «Умный» and «Мне
 * повезёт» are Pro-gated (non-Pro → paywall; Pro → "скоро", нейросеть ещё не вшита).
 */
export function DateWheel({
  open,
  onClose,
  isPro,
  onOpenAdmin,
}: {
  open: boolean;
  onClose: () => void;
  isPro: boolean;
  onOpenAdmin: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("filters");
  const [cat, setCat] = useState<Cat>("");
  const [mode, setMode] = useState<Mode>("random");
  const [idea, setIdea] = useState<DateIdeaResponse | null>(null);
  const [paywall, setPaywall] = useState(false);

  function pickMode(m: Mode) {
    if (m === mode) return;
    if (m !== "random" && !isPro) {
      haptic("light");
      setPaywall(true);
      return;
    }
    haptic("light");
    setMode(m);
    setPhase("filters");
    setIdea(null);
  }

  async function spin() {
    setPhase("spinning");
    haptic("light");
    try {
      const result = await endpoints.getDateIdea(cat || undefined);
      setIdea(result);
      setTimeout(() => {
        setPhase("result");
        haptic("success");
      }, 1100);
    } catch {
      setPhase("filters");
    }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="🎡 Колесо свиданий">
        <div className="flex flex-col gap-2 py-2">
          {/* Mode selector */}
          <p className="section-label" style={{ margin: "2px 0 2px" }}>Режим</p>
          <div className="chip-row">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => pickMode(m.id)}
                className={`chip ${mode === m.id ? "active" : ""}`}
              >
                {m.label}
                {m.locked && !isPro ? " 🔒" : ""}
              </button>
            ))}
          </div>

          {mode !== "random" && isPro ? (
            <div className="card" style={{ marginTop: 4 }}>
              <div className="card-title">🚧 Скоро</div>
              <div className="card-sub">
                {mode === "smart"
                  ? "Здесь нейросеть будет выбирать из вишлиста по городу, погоде и вашему настроению."
                  : "Здесь нейросеть предложит свидание — даже не из вашего списка."}
              </div>
            </div>
          ) : null}

          {phase === "filters" && (
            <>
              <p className="sub" style={{ marginTop: 6 }}>Сузим варианты под вас</p>
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
              <button
                type="button"
                className="btn-warm mt-2"
                onClick={spin}
                disabled={mode !== "random"}
              >
                {mode === "random" ? "🎡 Крутить! →" : "Выберите «Случайное» чтобы крутить"}
              </button>
            </>
          )}

          {phase === "spinning" && (
            <>
              <h1 className="heading" style={{ textAlign: "center" }}>Крутится…</h1>
              <div className="spin-pointer" />
              <div className="spin spinning" />
              <p style={{ textAlign: "center", fontSize: 14, color: "var(--tg-hint)", marginTop: 20 }}>
                Подбираем из ваших идей…
              </p>
            </>
          )}

          {phase === "result" && idea && (
            <>
              <h1 className="heading" style={{ textAlign: "center" }}>Выпало!</h1>
              <div className="hero-warm" style={{ textAlign: "center", padding: "28px 20px" }}>
                <div style={{ fontSize: 56, marginBottom: 10 }}>{ideaEmoji(idea)}</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{idea.title}</div>
                <div style={{ fontSize: 14, color: "var(--tg-hint)", marginTop: 6 }}>
                  {idea.source === "wishlist" ? "Из вашего списка желаний" : "Идея на сейчас"}
                </div>
              </div>
              {idea.reason ? (
                <div className="card" style={{ marginTop: 4 }}>
                  <div className="card-title">✨ Почему это для вас</div>
                  <div className="card-sub">{idea.reason}</div>
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={spin}>🔄 Ещё</button>
                <button type="button" className="btn-warm" style={{ flex: 1 }} onClick={onClose}>👍 Идём!</button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Paywall
        open={paywall}
        onClose={() => setPaywall(false)}
        onAdminHint={() => {
          setPaywall(false);
          onOpenAdmin();
        }}
      />
    </>
  );
}

function ideaEmoji(idea: DateIdeaResponse): string {
  const map: Record<string, string> = { eat: "🍽️", do: "🚶", watch: "🎬", stay: "🛌", buy: "🛍️" };
  return map[idea.category ?? ""] ?? "🎲";
}
