import { useEffect, useRef, useState } from "react";
import { endpoints, type DateIdeaResponse } from "../sdk/api";
import { haptic } from "../sdk/twa";
import { CATEGORIES, categoryEmoji } from "../lib/categories";
import { COPY } from "../copy";
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
  /** Shown in the result area when a spin fails — replaces the previous
   * silent no-op so the user knows to retry. Cleared on next spin. */
  const [spinError, setSpinError] = useState<string | null>(null);
  /** Handle for the post-fetch 1100ms "phase → result" flip. Stored so rapid
   * re-spins and unmounts cancel the previous timer instead of letting a
   * stale handle call setState (potentially with the wrong idea). */
  const spinTimerRef = useRef<number | null>(null);
  /** Abort the in-flight getDateIdea fetch on unmount or on a re-spin. Without
   * this, a slow response can call setState after the user navigated away or
   * after a fresh spin already started — both race the new request. */
  const spinAbortRef = useRef<AbortController | null>(null);
  /** Bundle E: saving the spun idea to the shared wishlist. `saving` covers
   * the brief "disable while awaiting" window; `saved` flips the button
   * label to a confirmation line for a couple seconds. */
  const [savingToWishlist, setSavingToWishlist] = useState(false);
  const [savedToWishlist, setSavedToWishlist] = useState(false);
  const saveAbortRef = useRef<AbortController | null>(null);
  /** Auto-hide the "Добавлено в вишлист" confirmation after a few seconds.
   * Stored so a re-click (or unmount) can clear the pending timer. */
  const savedTimerRef = useRef<number | null>(null);

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
    // Cancel any pending post-fetch phase flip from a previous spin — without
    // this, rapid re-spins could fire a stale handle that flips phase to
    // "result" with an outdated idea.
    if (spinTimerRef.current !== null) {
      clearTimeout(spinTimerRef.current);
      spinTimerRef.current = null;
    }
    // Abort any in-flight getDateIdea from a previous spin so its late
    // setState can't race the new one.
    if (spinAbortRef.current) {
      spinAbortRef.current.abort();
      spinAbortRef.current = null;
    }
    setPhase("spinning");
    setSpinError(null);
    // Reset the save state so a fresh result starts from a clean slate — the
    // previous idea's "Добавлено в вишлист" line is no longer relevant.
    setSavedToWishlist(false);
    if (savedTimerRef.current !== null) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
    if (saveAbortRef.current) {
      saveAbortRef.current.abort();
      saveAbortRef.current = null;
    }
    setSavingToWishlist(false);
    haptic("light");
    const ctrl = new AbortController();
    spinAbortRef.current = ctrl;
    try {
      const result = await endpoints.getDateIdea(cat || undefined, mode, ctrl.signal);
      // If the user already kicked off another spin (or unmounted), drop this.
      if (spinAbortRef.current !== ctrl) return;
      setIdea(result);
      spinTimerRef.current = window.setTimeout(() => {
        spinTimerRef.current = null;
        setPhase("result");
        // Land thud: medium impact on the moment the card flips in. Combined
        // with the .date-result-bounce keyframe in index.css for visual pop.
        haptic("medium");
        haptic("success");
      }, 1100);
    } catch (e) {
      // AbortError on an unmount/re-spin is expected — keep the UI clean.
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (ctrl.signal.aborted) return;
      setPhase("filters");
      setSpinError("Не удалось получить идею — попробуйте ещё раз");
    }
  }

  /**
   * Bundle E: send the currently-spun idea into the shared wishlist. Called
   * from the "Сохранить в вишлист" button on the result card. Best-effort —
   * network errors are swallowed (no refetch); the user can always re-spin
   * or add manually from the wishlist tab.
   */
  async function saveIdeaToWishlist() {
    if (!idea || savingToWishlist) return;
    setSavingToWishlist(true);
    // Cancel any previous confirmation timer so rapid clicks keep the line
    // visible for a fresh full window instead of getting yanked early.
    if (savedTimerRef.current !== null) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
    const ctrl = new AbortController();
    saveAbortRef.current = ctrl;
    try {
      await endpoints.addWishlist({ title: idea.title }, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setSavedToWishlist(true);
      haptic("light");
      savedTimerRef.current = window.setTimeout(() => {
        savedTimerRef.current = null;
        setSavedToWishlist(false);
      }, 2500);
    } catch {
      // AbortError (component unmount) is expected; anything else is best-
      // effort — we don't surface it. The user can re-spin or open the
      // wishlist tab to retry.
      if (ctrl.signal.aborted) return;
    } finally {
      if (saveAbortRef.current === ctrl) {
        saveAbortRef.current = null;
      }
      setSavingToWishlist(false);
    }
  }

  // Clear any pending spin timer on unmount so we don't setState on a dead
  // component if the user navigates away during the 1100ms window.
  useEffect(() => {
    return () => {
      if (spinTimerRef.current !== null) {
        clearTimeout(spinTimerRef.current);
        spinTimerRef.current = null;
      }
      if (spinAbortRef.current) {
        spinAbortRef.current.abort();
        spinAbortRef.current = null;
      }
      if (saveAbortRef.current) {
        saveAbortRef.current.abort();
        saveAbortRef.current = null;
      }
      if (savedTimerRef.current !== null) {
        clearTimeout(savedTimerRef.current);
        savedTimerRef.current = null;
      }
    };
  }, []);

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
        onPointerCancel={cancelLong}
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
            {spinError ? (
              <div className="banner-warm" role="alert" style={{ marginTop: 6 }}>
                {spinError}
              </div>
            ) : null}
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
          <div className="date-result-bounce">
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
            {/* Bundle E: send the spun idea to the shared wishlist. Hidden
                when the idea is already FROM the wishlist (a wishlist-source
                idea is by definition already in the list). */}
            {idea.source !== "wishlist" ? (
              <button
                type="button"
                className="btn-ghost"
                style={{ marginTop: 8, width: "100%" }}
                onClick={saveIdeaToWishlist}
                disabled={savingToWishlist}
                aria-busy={savingToWishlist}
              >
                {savingToWishlist ? "…" : `📌 ${COPY.dateWheel.saveToWishlist}`}
              </button>
            ) : null}
            {savedToWishlist ? (
              <div
                className="card-sub"
                role="status"
                aria-live="polite"
                style={{ textAlign: "center", marginTop: 6, color: "var(--tg-hint)" }}
              >
                ✓ {COPY.dateWheel.savedToWishlist}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={spin}>🔄 Ещё</button>
              <button type="button" className="btn-warm" style={{ flex: 1 }} onClick={() => { setPhase("filters"); setIdea(null); setSpinError(null); }}>👍 Готово</button>
            </div>
          </div>
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
