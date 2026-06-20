import { useEffect, useState } from "react";
import { COPY } from "../copy";
import { Card } from "./Card";
import { haptic } from "../sdk/twa";

/** A small weekly ritual checklist, persisted per ISO week in localStorage.
 *
 * No backend yet — this is an ambient nudge to be together. The check state is
 * keyed by year+week so it resets each week. If/when a backend ritual table is
 * added, this component is the UI surface to keep.
 */
function weekKey(d = new Date()): string {
  // ISO week year + week number (stable, resets Mondays).
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${week}`;
}

const STORAGE_KEY = "pairly.rituals";

export function Rituals() {
  const week = weekKey();
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}.${week}`);
      setDone(raw ? (JSON.parse(raw) as Record<string, boolean>) : {});
    } catch {
      setDone({});
    }
  }, [week]);

  function toggle(id: string) {
    setDone((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(`${STORAGE_KEY}.${week}`, JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
      haptic("light");
      return next;
    });
  }

  const total = COPY.home.rituals.length;
  const count = Object.values(done).filter(Boolean).length;
  const pct = total ? Math.round((count / total) * 100) : 0;
  const allDone = total > 0 && count === total;

  return (
    <Card>
      <div className="card-row" style={{ alignItems: "baseline", gap: 10 }}>
        <div className="card-title">🔁 {COPY.home.cardRitualsTitle}</div>
        <div className="card-sub" style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
          {count}/{total}
        </div>
      </div>
      <div className="progress" style={{ marginTop: 6 }}>
        <div
          className="progress-fill"
          style={{ width: `${pct}%`, background: allDone ? "var(--tg-warm)" : "var(--tg-button)" }}
        />
      </div>
      <div className="card-sub" style={{ margin: "8px 0 2px" }}>{COPY.home.ritualsSub}</div>
      <ul className="flex flex-col gap-1" style={{ marginTop: 6 }}>
        {COPY.home.rituals.map((r) => {
          const checked = !!done[r.id];
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => toggle(r.id)}
                aria-pressed={checked}
                className="ritual-row"
              >
                <span className="ritual-check" aria-hidden>{checked ? "✓" : ""}</span>
                <span className="ritual-label">
                  <span className="emoji" style={{ fontSize: 18 }}>{r.emoji}</span>
                  <span className={checked ? "done" : ""}>{r.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {allDone ? (
        <div className="banner banner-warm" style={{ marginTop: 10 }}>
          <span className="emoji">🎉</span>
          <div style={{ flex: 1 }}>все ритуалы недели выполнены — вы молодцы</div>
        </div>
      ) : null}
    </Card>
  );
}
