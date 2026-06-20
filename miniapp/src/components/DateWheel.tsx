import { useRef, useState } from "react";
import { endpoints, type DateIdeaResponse } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { CATEGORIES, categoryEmoji } from "../lib/categories";
import { Paywall } from "./Paywall";

type Phase = "filters" | "spinning" | "result";
type Mode = "random" | "smart" | "lucky";

const CATS: { id: string; label: string }[] = [
  { id: "", label: "🎲 Любая" },
  ...CATEGORIES.map((c) => ({ id: c.id, label: `${c.emoji} ${c.label}` })),
];

const MODES: { id: Mode; label: string; locked: boolean }[] = [
  { id: "random", label: "🎲 Случайное", locked: false },
  { id: "smart", label: "🧠 Умный", locked: true },
  { id: "lucky", label: "🍀 Мне повезёт", locked: true },
];

/**
 * Date-wheel SCREEN (a top-level tab) — 3 modes (gallery R-warm): filter chips →
 * spinning conic wheel → warm result card. Mode 1 (random, from wishlist) is free;
 * «Умный» and «Мне повезёт» are Pro-gated (non-Pro → paywall; Pro → "скоро").
 */
export function DateWheelScreen({
  isPro,
  onOpenAdmin,
}: {
  isPro: boolean;
  onOpenAdmin: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("filters");
  const [cat, setCat] = useState<string>("");
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
      const result = await endpoints.getDateIdea(cat || undefined, mode);
      setIdea(result);
      setTimeout(() => {
        setPhase("result");
        haptic("success");
      }, 1100);
    } catch {
      setPhase("filters");
    }
  }

  // Hidden admin entry: long-press the heading.
  const longRef = useRef<number | null>(null);
  const startLong = () => {
    longRef.current = window.setTimeout(() => {
      onOpenAdmin();
      haptic("light");
    }, 600);
  };
  const cancelLong = () => {
    if (longRef.current !== null) {
      clearTimeout(longRef.current);
      longRef.current = null;
    }
  };

  return (
    <div className="app-scroll mx-auto max-w-md px-4 py-4">
      <h1
        className="heading"
        onPointerDown={startLong}
        onPointerUp={cancelLong}
        onPointerLeave={cancelLong}
        style={{ userSelect: "none" }}
      >
        🎡 Колесо свиданий
      </h1>
      <div className="sub">Крутаните — и вечером есть план</div>

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
          <p className="sub" style={{ marginTop: 2 }}>
            {mode === "smart"
              ? "Нейросеть выберет из вашего вишлиста по настроению."
              : "Нейросеть предложит свидание — даже не из вашего списка."}
          </p>
        ) : null}

        {phase === "filters" && (
          <>
            <p className="sub" style={{ marginTop: 6 }}>Сузим варианты под вас</p>
            <p className="section-label">Категория</p>
            <div className="chip-row">
              {CATS.map((c) => (
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
            <div className="spin-pointer" />
            <div className="spin spinning" />
            <p style={{ textAlign: "center", fontSize: 14, color: "var(--tg-hint)", marginTop: 20 }}>
              Подбираем из ваших идей…
            </p>
          </>
        )}

        {phase === "result" && idea && (
          <>
            <div className="hero-warm" style={{ textAlign: "center", padding: "28px 20px", marginTop: 6 }}>
              <div style={{ fontSize: 56, marginBottom: 10 }}>{categoryEmoji(idea.category)}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{idea.title}</div>
              <div style={{ fontSize: 14, color: "var(--tg-hint)", marginTop: 6 }}>
                {idea.source === "wishlist"
                  ? "Из вашего списка желаний"
                  : idea.source === "ai"
                    ? "Идея от нейросети 🍀"
                    : "Идея на сейчас"}
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
              <button type="button" className="btn-warm" style={{ flex: 1 }} onClick={() => { setPhase("filters"); setIdea(null); }}>👍 Готово</button>
            </div>
          </>
        )}
      </div>

      <Paywall
        open={paywall}
        onClose={() => setPaywall(false)}
        onAdminHint={() => {
          setPaywall(false);
          onOpenAdmin();
        }}
      />
    </div>
  );
}
