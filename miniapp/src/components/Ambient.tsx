import { useEffect, useState } from "react";
import { COPY } from "../copy";
import { Card } from "./Card";
import { haptic } from "../sdk/twa";

/* ─────────────────────────────────────────────────────────────────────────
   Couple-challenge + Gratitude — ambient weekly/daily pair cards (R-warm).
   Both are localStorage-backed (per ISO week / per day) like Rituals. No
   backend: these are gentle nudges, not persisted history.
   ──────────────────────────────────────────────────────────────────────── */

function weekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${week}`;
}

// Rotating weekly challenges keyed deterministically by week (so both partners
// who land on the same week see the same prompt — no sync needed).
const CHALLENGES: { emoji: string; title: string; desc: string }[] = [
  { emoji: "📵", title: "Свидание без телефонов", desc: "Уберите гаджеты на 2 часа и побудьте только вдвоём" },
  { emoji: "🍳", title: "Ужин своими руками", desc: "Приготовьте что-то новое вместе, по рецепту или на глаз" },
  { emoji: "🚶", title: "Прогулка без маршрута", desc: "Идите куда глаза глядят целый час" },
  { emoji: "💬", title: "Глубокий разговор", desc: "Спросите то, что давно хотели узнать друг о друге" },
  { emoji: "🌅", title: "Встретить закат", desc: "Найдите точку и проводите солнце вместе" },
];

/** Weekly couple-challenge — a warm hero with a 3-state accept→done flow. */
export function CoupleChallenge() {
  const week = weekKey();
  const idx = (() => {
    // simple stable hash of week string → index
    let h = 0;
    for (const c of week) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h % CHALLENGES.length;
  })();
  const ch = CHALLENGES[idx];

  // 0 = idle, 1 = accepted, 2 = done.
  const [step, setStep] = useState(0);
  useEffect(() => {
    const raw = localStorage.getItem(`pairly.challenge.${week}`);
    setStep(raw ? Number(JSON.parse(raw)) || 0 : 0);
  }, [week]);

  function persist(next: number) {
    setStep(next);
    try {
      localStorage.setItem(`pairly.challenge.${week}`, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    haptic(next === 2 ? "success" : "light");
  }

  const pct = step === 0 ? 0 : step === 1 ? 50 : 100;

  return (
    <div className="hero-warm" style={{ padding: "18px 18px 16px" }}>
      <div className="card-row" style={{ alignItems: "center", gap: 12 }}>
        <span className="emoji" style={{ fontSize: 34, flexShrink: 0 }}>{ch.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "var(--tg-warm)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
            {COPY.home.challengeTitle}
          </div>
          <div className="card-title" style={{ marginTop: 2 }}>{ch.title}</div>
          <div className="card-sub" style={{ marginTop: 2 }}>{ch.desc}</div>
        </div>
      </div>

      <div className="progress" style={{ marginTop: 12 }}>
        <div className="progress-fill" style={{ width: `${pct}%`, background: step === 2 ? "var(--tg-warm)" : "var(--tg-button)" }} />
      </div>

      <div className="card-actions" style={{ marginTop: 10 }}>
        {step === 0 ? (
          <button type="button" className="card-act warm" onClick={() => persist(1)}>
            {COPY.home.challengeAccept}
          </button>
        ) : step === 1 ? (
          <>
            <button type="button" className="card-act ghost" onClick={() => persist(0)}>Отмена</button>
            <button type="button" className="card-act warm" onClick={() => persist(2)}>✓ Выполнили</button>
          </>
        ) : (
          <>
            <span className="card-sub" style={{ flex: 1, color: "var(--tg-warm)", fontWeight: 600 }}>🎉 {COPY.home.challengeDone}</span>
            <button type="button" className="card-act ghost" onClick={() => persist(0)}>↺</button>
          </>
        )}
      </div>
    </div>
  );
}

function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Daily gratitude — gallery-faithful: a warm banner prompt when empty, a tidy
 * quote card when filled, and a compact form only while editing (per day). */
export function Gratitude() {
  const day = dayKey();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(`pairly.gratitude.${day}`);
    if (raw) {
      setText(JSON.parse(raw));
      setSaved(true);
      setEditing(false);
    } else {
      setText("");
      setSaved(false);
      setEditing(false);
    }
  }, [day]);

  function save() {
    try {
      localStorage.setItem(`pairly.gratitude.${day}`, JSON.stringify(text));
      setSaved(true);
      setEditing(false);
      haptic("success");
    } catch {
      /* ignore */
    }
  }

  // Filled today + not editing → a clean quote card (gallery .card.card-row).
  if (saved && text.trim() && !editing) {
    return (
      <button
        type="button"
        className="card card-row"
        style={{ border: "none", cursor: "pointer", textAlign: "left", background: "color-mix(in srgb, var(--tg-warm) 8%, var(--tg-sec))" }}
        onClick={() => setEditing(true)}
      >
        <span className="emoji" style={{ fontSize: 28 }}>🙏</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-title" style={{ fontStyle: "italic" }}>«{text.trim()}»</div>
          <div className="card-sub">сегодня · спасибо</div>
        </div>
      </button>
    );
  }

  // Empty + not editing → warm banner prompt (gallery s1).
  if (!editing) {
    return (
      <button
        type="button"
        className="banner banner-warm"
        style={{ border: "none", cursor: "pointer", width: "100%", textAlign: "left" }}
        onClick={() => setEditing(true)}
      >
        <span className="emoji">🙏</span>
        <div style={{ flex: 1 }}>
          <strong>{COPY.home.gratitudeTitle}</strong>
          <br />
          <span style={{ fontSize: 12 }}>{COPY.home.gratitudeSub}</span>
        </div>
      </button>
    );
  }

  // Editing → compact form.
  return (
    <Card>
      <div className="section-label" style={{ margin: "0 0 6px" }}>🙏 {COPY.home.gratitudeTitle}</div>
      <textarea
        className="input"
        placeholder={COPY.home.gratitudePlaceholder}
        maxLength={280}
        value={text}
        autoFocus
        onChange={(e) => { setText(e.target.value); }}
        style={{ minHeight: 80 }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" className="btn-warm" style={{ flex: 1 }} onClick={save} disabled={!text.trim()}>
          {COPY.common.save}
        </button>
        <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={() => { setEditing(false); if (!saved) setText(""); }}>
          {COPY.common.skip}
        </button>
      </div>
    </Card>
  );
}
